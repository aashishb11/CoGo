# CultuCat Integration Plan

## Scope

Integrate the CultuCat external events API as a thin live proxy, plus optional
event traceability on sporadic CoGo trips:

1. List CultuCat events via `GET /api/cultucat/events` (live proxy).
2. Read a CultuCat event by its numeric id via `GET /api/cultucat/events/:eventId`
   (live proxy to CultuCat's detail endpoint).
3. Accept an optional CultuCat event reference when creating sporadic CoGo
   trips, validating it against the live CultuCat detail endpoint.

## Live CultuCat contract

- Base URL `http://nattech.fib.upc.edu:40373`; auth header `x-api-key`.
- Search: `POST /external/events` with `{ dateFrom, dateTo, location, page? }`,
  where `location` is `{ mode: "coordinates", lat, lng, radiusKm }` or
  `{ mode: "municipi", municipi }`. Response: `{ status, message, data, meta }`.
- Detail: `GET /external/events/{id}` where `{id}` is a positive integer.
  Response: `{ status, message, data }`. 404 when no such event.

## Design

- No local cache. CoGo holds no `external_events` table; both endpoints are
  thin live proxies to CultuCat. The detail endpoint removed the need for the
  former narrow-search "refresh" workaround.
- `integrations/cultucat` owns the HTTP client: auth header, timeout via
  `AbortController`, and error-kind translation (`bad_request`, `unauthorized`,
  `not_found`, `upstream`, `timeout`, `network`).
- `modules/cultucat` exposes the controller/service/DTO/mapper. The mapper is an
  anti-corruption layer: it maps upstream `comarca`/`municipi`/`ambits` onto
  CoGo's own `region`/`municipality`/`scopes` DTO fields.
- The canonical event identifier everywhere in CoGo (`eventId` in the path, in
  `CultucatEventResponseDto`, in `externalEventContext`, in
  `trips.external_event_id`) is CultuCat's numeric `id` as a string.
- `trips` keeps two nullable columns (`external_event_provider`,
  `external_event_id`) plus `trips_external_event_idx` to persist the event
  reference on a trip.

## Trip creation with a CultuCat event

`externalEventContext` is an optional traceability tag, allowed only on
`sporadic` trips. `destination` is always required and supplied by the
frontend; the backend never defaults it. When `externalEventContext` is
present, trip creation:

1. Calls the CultuCat detail endpoint to confirm the event exists — 404 →
   reject with `CULTUCAT_EVENT_NOT_FOUND`; unreachable/timeout/5xx → 503
   `SERVICE_UNAVAILABLE`.
2. Runs a strict proximity check: the haversine distance between the
   client-provided destination and the event coordinates must be within
   `CULTUCAT_EVENT_MAX_DISTANCE_KM` (default 2), else reject with a 400.
3. Persists `external_event_provider = 'cultucat'` and the numeric event id.

## Order

1. Config: replace `CULTUCAT_EVENTS_SEARCH_PATH` with `CULTUCAT_EVENTS_PATH`
   (`/external/events`), add `CULTUCAT_EVENT_MAX_DISTANCE_KM`, drop the cache /
   resync env vars.
2. Drop the `external_events` table, repository, and resync service.
3. Update the client (`searchEvents` + new `getEventById`), types, service
   (thin proxy), mapper, DTOs, and controller (`ParseIntPipe` on `:eventId`).
4. Update trip DTO/service for required `destination` and event validation.
5. Regenerate the migration so it contains only the two `trips` columns and the
   index, then run lint, type-check, build, and tests.
