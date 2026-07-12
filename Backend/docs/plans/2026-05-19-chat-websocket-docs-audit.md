# Chat WebSocket Docs Audit

**Date:** 2026-05-19
**Status:** Completed

## Scope

Verify the trip chat implementation, identify the packages involved in REST and WebSocket documentation, and determine why the WebSocket interface does not appear in `/api/docs`.

## Checklist

- Inspect chat REST controller and chat gateway wiring.
- Inspect Swagger/Scalar bootstrap and generated document assembly.
- Inspect installed documentation and websocket packages for scanning boundaries.
- Confirm where the current websocket contract is documented.

## Result

The generated docs are OpenAPI-based and assembled from Nest controllers plus Better Auth OpenAPI paths. The chat realtime interface is implemented as a Socket.IO gateway (`namespace: /chat`, `join_thread`, `chat.message.*`, `chat.thread.updated`) and is documented only in `docs/plans/2026-05-12-trip-chat-websocket.md`, not in the generated OpenAPI document.
