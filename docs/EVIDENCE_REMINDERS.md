# Recurring geo-tagged evidence

The application keeps a repeatable before-and-after crop record for every active
crop cycle. A new cycle receives a baseline reminder when the cycle is created;
the next due date advances only after a complete evidence submission is
finalized.

## Default protocol

- Cadence: 30 days, configurable from 14 to 90 days
- Reminder lead: 3 days, configurable from 0 to 7 days through the API
- Target: 5 photos, with 4 or 5 available as a reminder preference
- Guided capture contract: wide field, left context, mid canopy, right context,
  and close-up damage
- Every frame carries capture time, GPS coordinates, accuracy, checksum,
  dimensions, and capture-order metadata
- Server finalization requires the complete five-angle contract and sends the
  submission to the local classification worker, followed by mandatory human
  review

## Delivery paths

`fp-beat` enqueues a due-plan scan every six hours. The reminders queue on
`fp-worker` writes de-duplicated in-app notifications. An overdue plan can
repeat at most weekly until the farmer uploads new evidence.

Native Android, iOS, and macOS builds mirror the server plan into an inexact
local notification so the prompt survives a temporary network outage. Android
reschedules after boot. Notification taps deep-link to guided capture for the
correct crop cycle after session restoration. The Docker web app uses
server-generated in-app notifications because background browser scheduling is
not portable across browsers.

## Farmer controls

Open **Evidence reminders** from Home or Settings. A farmer can:

- start capture for the correct crop cycle
- change cadence and the 4–5 photo preference
- pause or resume the plan
- snooze by two days in the UI, or one to seven days through the API or Fasal
  Saathi voice assistant

All plan changes are scoped to crop cycles owned by the authenticated farmer
and write audit-log records. Voice changes use the same endpoints and require a
fresh, explicit spoken confirmation.

## Local check

With the Docker stack running, confirm `fp-beat` and `fp-worker` are active.
Local seed creates demo **accounts and catalogs only** — no farms or crop
cycles. Create a farm, plot, and crop cycle in the field app (or via confirmed
voice actions), then open **Evidence reminders**. Use **Capture now** for the
baseline record. The next due date moves forward only after
upload and finalization succeed.
