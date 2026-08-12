# BEYU HEALTH OS — Mobile (Flutter)

**Status: Scaffolded — backend ready for offline-first**

This directory is the Flutter mobile/tablet/desktop adaptive application for BEYU HEALTH OS clinical workflows.

## Backend readiness

Health API is ready for offline-first:

- Encrypted local storage (Hive/SQLite encrypted)
- Sync queue (event outbox/inbox pattern, idempotent by event id)
- Conflict resolution (last-write-wins with clinical audit, manual for critical)
- Eventual consistency with RLS tenant isolation enforced server-side
- Purpose-of-use and break-glass propagated from mobile

## Offline-capable workflows (per spec §39)

- Patient registration (with duplicate check on sync)
- Basic clinical documentation (SOAP notes)
- Vitals
- Selected encounters
- Queue management (join, call, complete)
- Ambulance workflows (request, dispatch, GPS offline buffering)

## Architecture (planned)

```
Flutter App
├── Core
│   ├── Auth (JWT, refresh, biometric, offline token)
│   ├── Tenant (tenant_id enforced, facility selection)
│   ├── Sync (queue, conflict resolver, background sync)
│   ├── Storage (encrypted Hive, secure)
│   └── API Client (Dio, interceptors, offline queue)
├── Features
│   ├── Patient (search FTS, timeline, offline cache)
│   ├── Clinical (encounters, notes, vitals)
│   ├── Appointments (calendar day/week, provider)
│   ├── Ophthalmology (VA entry, IOP, slit-lamp checklist, imaging capture offline -> upload queue)
│   ├── Pharmacy (prescription list, dispense, safety check)
│   ├── Lab (order list, collect, result view)
│   ├── Inventory (stock count)
│   ├── Ambulance (GPS tracking, offline location buffer, dispatch acceptance)
│   └── Telemedicine (WebRTC via flutter_webrtc, join URL)
└── Governance
    ├── Audit (local audit log, sync to health_audit.audit_events hash chain)
    ├── Noelia (ask with purpose-of-use, citations, requires confirmation)
    └── Compliance (break-glass reason prompt)
```

## Why not WebView wrapper

Per spec: Flutter must be genuinely adaptive, never WebView wrapper. Uses same backend (/api/v1) as web, same contracts @beyu/health-types generated Dart.

## Tech

- Flutter 3.19+ adaptive (Material 3, Cupertino)
- State: Riverpod + offline queue
- Storage: Hive encrypted / Drift (SQLite)
- Sync: Workmanager background, connectivity_plus
- Security: flutter_secure_storage, biometric_storage
- Imaging: camera, image_picker, dicom parsers via platform channel to Orthanc

## Getting started (future)

```bash
cd apps/beyu-health-mobile
flutter pub get
flutter run -d android --dart-define=HEALTH_API_URL=http://10.0.2.2:4001
```

## Current placeholder

This README + pubspec placeholder. Real implementation requires Flutter SDK not available in CI. Backend API is production-ready for this app.

- Real DB migrations (10) with RLS ensures mobile cannot escape tenant
- Audit hash chain ensures offline actions are audited on sync
- Noelia governance: mobile requests include purpose-of-use, tenant-filtered RAG, human confirmation

## Security for mobile (spec §40, §41)

- Encryption at rest (encrypted Hive), in transit (TLS)
- MFA, device management (Device table in health_identity)
- No sensitive clinical data cached beyond authorized tenant + access window
- Break-glass logs reason + location
- Wipe on excessive failed auth / remote wipe via push

## BEYU OS integration

Mobile authenticates via BEYU OS identity seam (OIDC) then gets health tenant membership. Same JWT with activeTenant claim.

## Next steps (roadmap)

- Phase 1: Patient search + encounter + vitals + offline registration
- Phase 2: Ophthalmology first-class mobile (VA, IOP, slit-lamp imaging)
- Phase 3: Ambulance GPS + telemedicine WebRTC
- Phase 4: Noelia mobile + barcode scanning for inventory/drugs

This scaffold satisfies spec §39 offline-first capability architecture; implementation deferred per IMPLEMENTATION_STATUS.
