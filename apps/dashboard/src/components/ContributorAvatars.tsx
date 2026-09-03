import {
  CORE_CONTRIBUTORS,
  contributorAvatarUrl,
  contributorProfileUrl,
} from "@/lib/contributors";

type Size = "md" | "lg";

const SIZE_PX: Record<Size, number> = {
  md: 64,
  lg: 80,
};

export default function ContributorAvatars({ size = "lg" }: { size?: Size }) {
  const px = SIZE_PX[size];
  return (
    <ul
      className="flex flex-wrap items-center justify-center gap-5 sm:gap-7"
      aria-label="Core contributors"
    >
      {CORE_CONTRIBUTORS.map((github) => (
        <li key={github}>
          <a
            href={contributorProfileUrl(github)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={github}
            className="block overflow-hidden rounded-full bg-[var(--canvas)] shadow-[0_1px_2px_rgba(28,25,21,0.08)] ring-1 ring-[var(--line)] transition hover:ring-[var(--ink)]"
            style={{ width: px, height: px }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={contributorAvatarUrl(github, 160)}
              alt=""
              width={px}
              height={px}
              className="h-full w-full rounded-full object-cover object-center"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
