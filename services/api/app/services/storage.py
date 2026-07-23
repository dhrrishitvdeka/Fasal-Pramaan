"""S3-compatible object storage (MinIO locally)."""

from __future__ import annotations

import logging
from hashlib import sha256
from typing import Optional
from uuid import uuid4

import boto3
from botocore.client import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class StorageUnavailableError(RuntimeError):
    """The evidence store could not be reached or returned an unexpected error."""


def _client(public: bool = False):
    """S3-compatible client (MinIO local, AWS S3, or GCS interoperability endpoint)."""
    settings = get_settings()
    endpoint = settings.minio_public_endpoint if public else settings.minio_endpoint
    # Empty endpoint → default AWS regional endpoint (managed S3)
    endpoint_url = None
    if endpoint:
        scheme = "https" if settings.minio_use_ssl else "http"
        # Already absolute URL?
        if endpoint.startswith("http://") or endpoint.startswith("https://"):
            endpoint_url = endpoint
        else:
            endpoint_url = f"{scheme}://{endpoint}"
    style = getattr(settings, "s3_addressing_style", "path") or "path"
    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=settings.minio_access_key,
        aws_secret_access_key=settings.minio_secret_key,
        region_name=settings.s3_region,
        config=Config(signature_version="s3v4", s3={"addressing_style": style}),
    )


def ensure_bucket() -> None:
    settings = get_settings()
    client = _client(public=False)
    try:
        client.head_bucket(Bucket=settings.minio_bucket)
    except ClientError as exc:
        status = int(exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode", 0))
        code = str(exc.response.get("Error", {}).get("Code", ""))
        if status != 404 and code not in {"404", "NoSuchBucket", "NotFound"}:
            raise StorageUnavailableError("Evidence bucket lookup failed") from exc
        try:
            client.create_bucket(Bucket=settings.minio_bucket)
            logger.info("Created bucket %s", settings.minio_bucket)
        except (BotoCoreError, ClientError) as create_exc:
            raise StorageUnavailableError("Evidence bucket creation failed") from create_exc
    except BotoCoreError as exc:
        raise StorageUnavailableError("Evidence storage is unavailable") from exc

    if settings.s3_bucket_versioning:
        try:
            client.put_bucket_versioning(
                Bucket=settings.minio_bucket,
                VersioningConfiguration={"Status": "Enabled"},
            )
            versioning = client.get_bucket_versioning(Bucket=settings.minio_bucket)
            if versioning.get("Status") != "Enabled":
                raise StorageUnavailableError("Evidence bucket versioning could not be enabled")
        except (BotoCoreError, ClientError) as exc:
            raise StorageUnavailableError("Evidence bucket versioning setup failed") from exc

def storage_health() -> bool:
    settings = get_settings()
    try:
        client = _client(public=False)
        client.head_bucket(Bucket=settings.minio_bucket)
        if settings.s3_bucket_versioning:
            versioning = client.get_bucket_versioning(Bucket=settings.minio_bucket)
            if versioning.get("Status") != "Enabled":
                return False
    except Exception:  # noqa: BLE001
        return False
    return True


def build_object_key(submission_id: str, angle_type: str, ext: str = "jpg") -> str:
    return f"evidence/{submission_id}/{angle_type}/{uuid4().hex}.{ext}"


def presigned_put_url(
    object_key: str,
    content_type: str = "image/jpeg",
    content_length: int | None = None,
    expires: int = 3600,
) -> str:
    settings = get_settings()
    client = _client(public=True)
    params: dict[str, object] = {
        "Bucket": settings.minio_bucket,
        "Key": object_key,
        "ContentType": content_type,
        "IfNoneMatch": "*",
    }
    if content_length is not None:
        params["ContentLength"] = content_length
    return client.generate_presigned_url(
        "put_object",
        Params=params,
        ExpiresIn=expires,
    )


def presigned_get_url(object_key: str, expires: int = 900) -> str:
    settings = get_settings()
    client = _client(public=True)
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.minio_bucket, "Key": object_key},
        ExpiresIn=expires,
    )


def object_exists(object_key: str) -> bool:
    return object_metadata(object_key) is not None


def object_metadata(object_key: str) -> dict | None:
    settings = get_settings()
    client = _client(public=False)
    try:
        return client.head_object(Bucket=settings.minio_bucket, Key=object_key)
    except ClientError as exc:
        status = int(exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode", 0))
        code = str(exc.response.get("Error", {}).get("Code", ""))
        if status == 404 or code in {"404", "NoSuchKey", "NotFound"}:
            return None
        raise StorageUnavailableError("Evidence storage metadata request failed") from exc
    except BotoCoreError as exc:
        raise StorageUnavailableError("Evidence storage is unavailable") from exc


def put_bytes(object_key: str, data: bytes, content_type: str = "image/jpeg") -> None:
    settings = get_settings()
    client = _client(public=False)
    client.put_object(
        Bucket=settings.minio_bucket,
        Key=object_key,
        Body=data,
        ContentType=content_type,
    )


def get_bytes(object_key: str) -> Optional[bytes]:
    settings = get_settings()
    client = _client(public=False)
    try:
        obj = client.get_object(Bucket=settings.minio_bucket, Key=object_key)
        return obj["Body"].read()
    except ClientError as exc:
        status = int(exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode", 0))
        code = str(exc.response.get("Error", {}).get("Code", ""))
        if status == 404 or code in {"404", "NoSuchKey", "NotFound"}:
            return None
        raise StorageUnavailableError("Evidence storage download failed") from exc
    except BotoCoreError as exc:
        raise StorageUnavailableError("Evidence storage is unavailable") from exc


def verify_object(
    object_key: str,
    *,
    expected_size: int,
    expected_content_type: str,
    expected_sha256: str,
) -> tuple[bool, list[str], bytes | None]:
    """Verify server-observed size, type, digest, and decodability inputs."""
    metadata = object_metadata(object_key)
    if metadata is None:
        return False, ["object_missing"], None
    issues: list[str] = []
    actual_size = int(metadata.get("ContentLength") or 0)
    actual_type = str(metadata.get("ContentType") or "").split(";", 1)[0].lower()
    if actual_size != expected_size:
        issues.append("byte_size_mismatch")
    if actual_type != expected_content_type.lower():
        issues.append("content_type_mismatch")
    data = get_bytes(object_key)
    if data is None:
        issues.append("object_missing")
    elif sha256(data).hexdigest().lower() != expected_sha256.lower():
        issues.append("sha256_mismatch")
    return not issues, issues, data
