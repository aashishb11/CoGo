/**
 * pnpm demo:reset --yes-i-am-pointing-at-prod
 *
 * SQL-only reset+seed against the prod Neon DB for the final-presentation
 * demo. Preserves team accounts, wipes everything else, then seeds 4 decoy
 * users + 5 decoy trips + 6 decoy rides.
 *
 * Companion docs:
 *   /Users/gabi/Code/pes/demo-implementation-plan.md
 *   /Users/gabi/Code/pes/demo-runbook.md
 *
 * NOTE: when re-running, keep CULTUCAT_VENUE_* env vars pointing at whatever
 * event the operator picked in pre-flight 1.8. If they're unset, trip E is
 * skipped with a console warning.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { inArray, notInArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  bookings,
  carModels,
  cars,
  chatMessages,
  chatThreads,
  pushSubscriptions,
  rides,
  safetyIncidents,
  trips,
  trustedContacts,
  user,
  userFavoriteTrips,
  userRatings,
  verification,
  walletHolds,
  walletTransactions,
  wallets,
} from '../src/core/database/schema';
import { profile } from '../src/core/database/schema/profile.schema';

// ── Team account allowlist (plan §4) ──────────────────────────────────────
const DRIVER_EMAILS = ['x.monente.serra@gmail.com'] as const;
const PASSENGER_EMAILS = ['adria.orb@gmail.com'] as const;
const ADMIN_EMAILS = ['gaesca04@gmail.com'] as const;
const OTHER_TEAM_EMAILS = [
  'gabriel.escobar@estudiantat.upc.edu',
  'danidrlombardia@gmail.com',
  'daniel.del.rio@estudiantat.upc.edu',
  'aashish.bhusal@estudiantat.upc.edu',
] as const;
const TEAM_EMAILS = [
  ...DRIVER_EMAILS,
  ...PASSENGER_EMAILS,
  ...ADMIN_EMAILS,
  ...OTHER_TEAM_EMAILS,
] as const;

// ── CultuCat trip E venue (pinned 2026-05-27; env override for re-picks) ───
// Pre-flight 1.8: CultuCat event id 10 (externalId 20241014008),
// "Extraterrestres" at CosmoCaixa, valid through 2026-08-29.
// If the event disappears before the demo, override via env vars.
const CULTUCAT_EVENT_ID = process.env.CULTUCAT_EVENT_ID ?? '10';
const CULTUCAT_VENUE_LABEL =
  process.env.CULTUCAT_VENUE_LABEL ??
  "CosmoCaixa Barcelona — Carrer d'Isaac Newton, 26, 08022 Barcelona";
const CULTUCAT_VENUE_LAT = process.env.CULTUCAT_VENUE_LAT
  ? Number(process.env.CULTUCAT_VENUE_LAT)
  : 41.4131805;
const CULTUCAT_VENUE_LNG = process.env.CULTUCAT_VENUE_LNG
  ? Number(process.env.CULTUCAT_VENUE_LNG)
  : 2.131123;

// ── Decoy polylines (plan §6.4) — resolved via OSRM at design time so the
// seed has no runtime network dependency.
const POLYLINE_FIB_TO_VALLDOREIX =
  '}{r{Fgy{K??d@y@@Qo@e@BUCKu@q@ECHWB[?YEYKWMQQKSEO?MBKDKHILINENCP?R@PBRDNHLFJHFJFJBL@@RL`H@N@f@OTyAvBIJCBCBGJqAdBKNHLtCdFLRfAjBLVFJhAlBJd@DT?BAHKN]j@QIs@Y{Aq@WEcAc@}Ao@i@Sm@SOGICg@Kg@Kw@[}B}@OIiE}AuCyA}@g@{@w@wA{A{A_B{DuCyAcAq@YsA]y@K}@]yAKOAa@Gg@IYGWKYM]UMKGEQI?ACKCIIOGEIEE?EAE?E@MMc@g@k@o@gBqBoAwAMKEEUIq@YQMs@w@CACCCCQUQSs@w@CCOQQQQSQQAECGGOCS@G@I?MCSIQKMGEUCG@I@IFIHEJCJGJGLELK\\Sb@q@z@IRIROTSZOTOXSp@E^Up@Qb@GTc@tA?@]dAQ|@UvA}@vF{BzOqClJqCfGsCpEgFtFkD`CsDlBqOzIiIlIoExGkFzH}HfHcDbDEB}@t@s@l@oAz@}AdAk@^}@f@{@f@wAt@iB`Ac@JwAv@{@h@WPi@b@[Xe@f@c@j@SVU^Yf@Q^S`@MXM^M`@Mb@GTI^Mj@Mp@Kp@c@~C_@`CUpAQx@St@Mf@Od@[z@a@bAWj@a@z@c@t@e@r@_@h@SVg@j@UTUV]ZkB`ByAvA_@f@]b@S\\a@p@Yj@Un@M\\M^U|@a@nB]lBWjA_@dBSr@Up@Yp@QZWf@]h@W^WX[\\]ZKJKHIHg@Zi@Ve@P_@HMBg@H_Cd@u@NU@Y?Y@WB[D[Fu@VSH[PcB|Ay@~@o@t@k@x@Yd@a@t@wAdDw@bBk@|@e@j@s@t@URg@^YP]R_Ad@gCdAgCx@yA\\cDn@mEf@g@D_CFiA?Y?Y?m@Ai@C_BSiAMyASYGYQa@a@Q]KUKa@GWOo@?CEOKQIYM[QYSWw@q@u@q@UQOIQEKAK?M?IBSDWLWLMJONQNQJMFE@G?I?EBEDEF?DGJIRITEHGHQ^}ApDKXwBlGm@jBIVEPE`@Ir@]`DIl@E`@Id@GREPGNGNKPILUXsAlAk@f@m@b@y@f@SJOFI@G@M@K?@H@F@J@HZbEP~BPpBFdCDdA@f@ExBE`CiBe@YE?VCRCTUrAKx@ETIj@AXCbAPh@Nd@Vr@@hCNv@Jn@?f@ClBJf@T`A|@dDXjAB`@?lAAhB@p@AvEBd@Jr@k@Pq@T}AjBsCfDqAlAs@bACEECEAE?EBEBAFAF?F@F@DBDDBD?D?H`A';

const POLYLINE_CAMPUS_NORD_TO_VOLPELLERES =
  'orr{Fc}{KP[\\i@FIHMRhAL`ADR|@zFH^BFDLHJDHLLRN^ZENEHa@fAi@tAuBfFQb@GJKTGJi@z@o@b@I@IDOJq@f@u@t@CDS@GBKNA?G?EBEF?BAHKN]j@QIs@Y{Aq@WEcAc@}Ao@i@Sm@SOGICg@Kg@Kw@[}B}@OIiE}AuCyA}@g@{@w@wA{A{A_B{DuCyAcAq@YsA]y@K}@]yAKOAa@Gg@IYGWKYM]UMKGEQI?ACKCIIOGEIEE?EAE?E@MMc@g@k@o@gBqBoAwAMKEEUIq@YQMs@w@CACCCCQUQSs@w@CCOQQQQSQQAECGGOCS@G@I?MCSIQKMGEUCG@I@IFIHEJCJGJGLELK\\Sb@q@z@IRIROTSZOTOXSp@E^Up@Qb@GTc@tA?@]dAQ|@UvA}@vF{BzOqClJqCfGsCpEgFtFkD`CsDlBqOzIiIlIoExGkFzH}HfHcDbDEB}@t@s@l@oAz@}AdAk@^}@f@{@f@wAt@iB`Ac@JwAv@{@h@WPi@b@[Xe@f@c@j@SVU^Yf@Q^S`@MXM^M`@Mb@GTI^Mj@Mp@Kp@c@~C_@`CUpAQx@St@Mf@Od@[z@a@bAWj@a@z@c@t@e@r@_@h@SVg@j@UTUV]ZkB`ByAvA_@f@]b@S\\a@p@Yj@Un@M\\M^U|@a@nB]lBWjA_@dBSr@Up@Yp@QZWf@]h@W^WX[\\]ZKJKHIHg@Zi@Ve@P_@HMBg@H_Cd@u@NU@Y?Y@WB[D[Fu@VSH[PcB|Ay@~@o@t@k@x@Yd@a@t@wAdDw@bBk@|@e@j@s@t@URg@^YP]R_Ad@gCdAgCx@yA\\cDn@mEf@g@D_CFiA?Y?Y?m@Ai@C}AImAIaG_@UC_DKgDBmFz@kB`Ag@RiB`AkCzA_Bv@y@\\iA`@_A\\eAXmAXoATu@J}BX_Fp@{BXaATcAV}Bt@gBt@qBz@{Az@qAv@y@`@uAp@sAf@o@Pw@No@Hi@BQ@mABiA?yAGuAUeDu@yEeAyBUoAGcACkA?y@@sABqAB_BBgB@{@?y@A]As@EcF_@{I{@??mC_@uBo@cAYSGYMUOUOYWWWGIGKCIACCKGSAKCIAK?K?OBQ@GH[`@iAHWDODOHq@Lq@FQDGBGLMBADCDCDGDI@GBI?M?MAMCKEICECCCAIEECE?E?C?C?E@IDCBEDABA@KBE?O@IBEAE?]Au@CwAGQKEASMIEEQGMGKMIMEMAM@GBE@IHEDEDKFCBE@M?OCICECMCMEo@QAG?CEAEAQOSIuBo@OEE?KCKCWAC?C_D?OCkD?C?O@EBGBC@G@K?Q?M?UAK@I@E@EDIBAHC`@MnAe@';

const POLYLINE_K2M_TO_PALAU =
  '}{r{Fgy{K??d@y@@Qo@e@BUCKu@q@ECHWB[?YEYKWMQQKSEO??UIkD?AAk@Aa@CcAEmCEqAEQTYp@aATYJOb@m@DGJUJOR[DEDGJMHOT[r@_ANSb@k@PWJOJQ\\e@H[~@sAJMR[BCBAHGNOFCJCJENFL@D@N@J?JATGTO@A@A@AHMEW[kBIi@AIGWMy@q@eEIg@Mw@AKCOUsAIi@ESYgBCSKm@CIEWEYo@cEG[E]EOUuAs@oE_@aCSiASqASoAO{@Ii@AISqACKE[_@{ByB}MWyAOaAG_@CKQiACOG]a@cCk@oDQeASoAWwAm@sDaA_GAEM}@o@aEAGCKAACIYu@H[D]ASCUCKEKEGGIGEYI??K?AAQUCECICGAE??CGCGIk@CIG]AKEWG]Gc@Ia@}@wFAIIg@Ki@AI}@oF?GKi@Gc@AI]sBAEWeBESAEGe@Ki@AKkAgHAICIAIaAcGAEGc@Ki@AKAGO{@EUAKAECQAIIi@AECKo@{DAIeAsG_@}B?GAMCq@AI?G?CASCQDS@SCSG[AEcAsGACEYR]JOJM\\g@|@sA\\e@BE^i@DGXc@`@m@b@o@^i@BE`@k@BEZc@t@eARY\\e@BCZe@@AZe@DEl@{@v@iA?A@A@C^i@HKZc@x@kAd@q@@CJOV_@DENU@CBCx@kAJO^i@@ADGZe@DE^k@tAoB@CV]FKLQ@CDGBCJONSFK@CRWhBqCBEPWNU^i@zA_CR[@ADGT]HK\\e@DGDGNSCCACOQCGm@{@CEMQEQAK?O?K?G?GJEBAvEgBHCGGACg@u@';

const POLYLINE_K2M_TO_SAGRADA =
  '}{r{Fgy{K??d@y@@Qo@e@BUCKu@q@ECHWB[?YEYKWMQQKSEO??UIkD?AAk@Aa@CcAEmCEqAEQTYp@aATYJOb@m@DGJUJOR[DEDGJMHOT[r@_ANSb@k@PWJOJQ\\e@H[~@sAJMR[BCBAHGNOFCJCJENFL@D@N@J?JATGTO@A@A@AHMEW[kBIi@AIGWMy@q@eEIg@Mw@AKCOUsAIi@ESYgBCSKm@CIEWEYo@cEG[E]EOUuAs@oE_@aCSiASqASoAO{@Ii@AISqACKE[_@{ByB}MWyAOaAG_@CKQiACOG]a@cCk@oDQeASoAWwAm@sDaA_GAEM}@o@aEAGCKAACIYu@H[D]ASCUCKEKEGGIGEYI??K?AAQUCECICGAE??CGCGIk@CIG]AKEWG]Gc@Ia@}@wFAIIg@Ki@AI}@oF?GKi@Gc@AI]sBAEWeBESAEGe@Ki@AKkAgHAICIAIaAcGAEGc@Ki@AKAGO{@EUAKAECQAIIi@AECKo@{DAIeAsG_@}B?GAMCq@AI?G?CASCQEQK[GWCGAEMq@EKCGCGAGG_@UyAG]AOGWE[AIc@iCUoA[a@GGECACACc@s@EE{@qACCYc@a@k@a@k@eBkCCCW]ACEGU[GKw@iAo@}@CEa@k@]i@aAwAOWAAYc@EGMQEGU[AE]e@uAsBCC]g@[g@y@kAo@}@AC]c@EI[c@g@q@EIi@u@QWAE]e@]g@iBoCAC_@i@CEYa@yBaDACIKW]GI_@e@{A{BCEa@m@b@o@^g@n@aA@ARYBCZe@BEBEXa@hAaB\\g@BC^i@`@j@T\\v@fALTBB`@j@FJTZfA~A';

// ── Decoy users + profiles (plan §6.1 / §6.2) ─────────────────────────────
interface DecoyUserSpec {
  emailLocal: string;
  email: string;
  name: string;
  username: string;
  image: string;
  xpPoints: number;
  ridesAsDriver: number;
  ridesAsPassenger: number;
  totalCo2Saved: number;
  badgeIds: string[];
  plate: string;
}

const DECOYS: DecoyUserSpec[] = [
  {
    emailLocal: 'marta',
    email: 'marta.fernandez@cogo.demo',
    name: 'Marta Fernández',
    username: 'marta_f',
    image: 'https://i.pravatar.cc/150?u=marta',
    xpPoints: 1240,
    ridesAsDriver: 18,
    ridesAsPassenger: 4,
    totalCo2Saved: 47.2,
    badgeIds: ['first_ride_driver', 'ride_milestone_10', 'eco_warrior'],
    plate: '1234ABC',
  },
  {
    emailLocal: 'pol',
    email: 'pol.serra@cogo.demo',
    name: 'Pol Serra',
    username: 'pol_s',
    image: 'https://i.pravatar.cc/150?u=pol',
    xpPoints: 820,
    ridesAsDriver: 9,
    ridesAsPassenger: 12,
    totalCo2Saved: 31.8,
    badgeIds: ['first_ride_driver', 'ride_milestone_10'],
    plate: '5678DEF',
  },
  {
    emailLocal: 'noa',
    email: 'noa.vilanova@cogo.demo',
    name: 'Noa Vilanova',
    username: 'noa_v',
    image: 'https://i.pravatar.cc/150?u=noa',
    xpPoints: 460,
    ridesAsDriver: 3,
    ridesAsPassenger: 7,
    totalCo2Saved: 15.4,
    badgeIds: ['first_ride_driver'],
    plate: '9012GHI',
  },
  {
    emailLocal: 'roger',
    email: 'roger.puig@cogo.demo',
    name: 'Roger Puig',
    username: 'roger_p',
    image: 'https://i.pravatar.cc/150?u=roger',
    xpPoints: 680,
    ridesAsDriver: 6,
    ridesAsPassenger: 5,
    totalCo2Saved: 22.1,
    badgeIds: ['first_ride_driver', 'ride_milestone_10'],
    plate: '3456JKL',
  },
];

// ── Demo date — today in Europe/Madrid (plan §6.5) ────────────────────────
// scheduled_departure is stored as UTC; Europe/Madrid in late May is UTC+2 (CEST).
function madridLocalToUtc(
  year: number,
  month: number,
  day: number,
  hh: number,
  mm: number,
): Date {
  return new Date(Date.UTC(year, month - 1, day, hh - 2, mm));
}

interface RideSpec {
  driverEmailLocal: 'marta' | 'pol' | 'noa' | 'roger';
  tripKey: 'A' | 'B' | 'C' | 'D' | 'E';
  hour: number;
  minute: number;
}

const RIDE_SPECS: RideSpec[] = [
  { driverEmailLocal: 'marta', tripKey: 'A', hour: 17, minute: 45 },
  { driverEmailLocal: 'pol', tripKey: 'B', hour: 19, minute: 30 },
  { driverEmailLocal: 'noa', tripKey: 'C', hour: 10, minute: 0 },
  { driverEmailLocal: 'noa', tripKey: 'C', hour: 14, minute: 0 },
  { driverEmailLocal: 'noa', tripKey: 'D', hour: 11, minute: 30 },
  { driverEmailLocal: 'roger', tripKey: 'E', hour: 20, minute: 0 },
];

// ── CLI guards (plan §5.1, §5.2) ──────────────────────────────────────────
const REQUIRED_FLAG = '--yes-i-am-pointing-at-prod';

function maskDatabaseUrl(url: string): string {
  return url.replace(/:\/\/[^@]+@/, '://***:***@');
}

function extractHost(url: string): string {
  return new URL(url).hostname;
}

async function main(): Promise<void> {
  if (!process.argv.includes(REQUIRED_FLAG)) {
    console.error(
      `\n[demo-reset] refusing to run without ${REQUIRED_FLAG}\n` +
        `             this is a destructive operation against the prod Neon DB.\n`,
    );
    process.exit(1);
  }

  // Re-load `.env.production.local` on top of whatever `dotenv/config` picked
  // up. This makes `pnpm demo:reset` work even when invoked from a shell
  // without DATABASE_URL pre-exported.
  loadEnv({ path: '.env.production.local', override: true });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(
      '[demo-reset] DATABASE_URL is not set after loading .env.production.local',
    );
    process.exit(1);
  }

  let host: string;
  try {
    host = extractHost(databaseUrl);
  } catch (err) {
    console.error(
      `[demo-reset] could not parse DATABASE_URL: ${(err as Error).message}`,
    );
    process.exit(1);
  }

  // Host guard: refuse if it isn't a Neon host. The bare `*.neon.tech` check
  // is enough to keep accidental localhost / staging pointers out — the prod
  // branch is the only Neon connection we ever ship with `--yes-...`.
  if (!host.endsWith('.neon.tech')) {
    console.error(
      `[demo-reset] DATABASE_URL host is ${host}; expected *.neon.tech for prod.\n` +
        `             Refusing to run.`,
    );
    process.exit(1);
  }

  console.log(`[demo-reset] target DB: ${maskDatabaseUrl(databaseUrl)}`);
  console.log(`[demo-reset] host:      ${host}`);
  console.log(`[demo-reset] drivers:   ${DRIVER_EMAILS.join(', ')}`);
  console.log(`[demo-reset] passenger: ${PASSENGER_EMAILS.join(', ')}`);
  console.log(`[demo-reset] admins:    ${ADMIN_EMAILS.join(', ')}`);
  console.log(`[demo-reset] other:     ${OTHER_TEAM_EMAILS.join(', ')}`);
  console.log(`[demo-reset] decoys:    ${DECOYS.length}`);

  const skipTripE =
    !CULTUCAT_VENUE_LABEL ||
    !Number.isFinite(CULTUCAT_VENUE_LAT) ||
    !Number.isFinite(CULTUCAT_VENUE_LNG);
  if (skipTripE) {
    console.warn(
      '[demo-reset] CULTUCAT venue env overrides parsed to invalid values — skipping trip E.',
    );
  } else {
    console.log(
      `[demo-reset] trip E venue: ${CULTUCAT_VENUE_LABEL} (${CULTUCAT_VENUE_LAT}, ${CULTUCAT_VENUE_LNG}) event=${CULTUCAT_EVENT_ID || '<unset>'}`,
    );
  }

  const client = postgres(databaseUrl, { max: 4, prepare: false });
  const db = drizzle(client);

  try {
    // Pre-flight: every team email must already exist.
    const existing = await db
      .select({ email: user.email })
      .from(user)
      .where(inArray(user.email, [...TEAM_EMAILS]));
    const haveSet = new Set(existing.map((r) => r.email));
    const missing = TEAM_EMAILS.filter((e) => !haveSet.has(e));
    if (missing.length > 0) {
      console.error(
        `[demo-reset] aborting: team emails missing from "user" table:\n  ${missing.join('\n  ')}`,
      );
      process.exit(1);
    }

    await db.transaction(async (tx) => {
      // a) Truncate demo-content tables. CASCADE handles FK chains.
      await tx.execute(sql`
        TRUNCATE
          ${chatMessages},
          ${userRatings},
          ${safetyIncidents},
          ${walletHolds},
          ${bookings},
          ${rides},
          ${trips},
          ${chatThreads},
          ${userFavoriteTrips},
          ${walletTransactions},
          ${verification}
        CASCADE
      `);

      const teamEmails = [...TEAM_EMAILS];

      // b) Reset team-user profile gamification (keep username/phone/bio).
      await tx
        .update(profile)
        .set({
          xpPoints: 0,
          badges: [],
          totalCo2Saved: 0,
          ridesAsDriver: 0,
          ridesAsPassenger: 0,
          locale: 'ca',
        })
        .where(
          inArray(
            profile.userId,
            tx
              .select({ id: user.id })
              .from(user)
              .where(inArray(user.email, teamEmails)),
          ),
        );

      // c) Clear better-auth ban columns on team users.
      await tx
        .update(user)
        .set({ banned: false, banReason: null, banExpires: null })
        .where(inArray(user.email, teamEmails));

      // d) Wipe per-user demo state for team users.
      const teamUserIdsSubquery = tx
        .select({ id: user.id })
        .from(user)
        .where(inArray(user.email, teamEmails));

      await tx
        .delete(trustedContacts)
        .where(inArray(trustedContacts.userId, teamUserIdsSubquery));
      await tx.delete(cars).where(inArray(cars.userId, teamUserIdsSubquery));
      await tx
        .delete(pushSubscriptions)
        .where(inArray(pushSubscriptions.userId, teamUserIdsSubquery));

      // d2) Re-insert the team driver's trusted contact (plan §5.3 d2).
      const [driverRow] = await tx
        .select({ id: user.id })
        .from(user)
        .where(inArray(user.email, [...DRIVER_EMAILS]))
        .limit(1);
      if (driverRow) {
        await tx.insert(trustedContacts).values({
          userId: driverRow.id,
          name: 'Gabi Escobar',
          email: 'gaesca04@gmail.com',
        });
      }

      // e) Wallet handling diverges by role.
      const passengerIdsSubquery = tx
        .select({ id: user.id })
        .from(user)
        .where(inArray(user.email, [...PASSENGER_EMAILS]));
      await tx
        .delete(wallets)
        .where(inArray(wallets.userId, passengerIdsSubquery));

      const driverIdsSubquery = tx
        .select({ id: user.id })
        .from(user)
        .where(inArray(user.email, [...DRIVER_EMAILS]));
      await tx
        .update(wallets)
        .set({ balanceCents: 0, heldCents: 0 })
        .where(inArray(wallets.userId, driverIdsSubquery));

      // f) Wipe non-team user rows. Use notInArray rather than raw `<> ALL`
      // because Drizzle's array interpolation produces a row constructor
      // `($1,$2,…)` which Postgres rejects with "op ANY/ALL requires array".
      await tx.delete(user).where(notInArray(user.email, teamEmails));

      // g) Insert decoys. car_model_id picked per decoy from car_models.
      const carModelRows = await tx
        .select({
          id: carModels.id,
          brand: carModels.brand,
          name: carModels.name,
        })
        .from(carModels)
        .limit(50);
      if (carModelRows.length === 0) {
        throw new Error('car_models is empty — run pnpm db:import-cars first');
      }

      const nowIso = new Date().toISOString();

      // Decoy users.
      const decoyUserIdByEmailLocal = new Map<string, string>();
      const decoyCarIdByEmailLocal = new Map<string, string>();
      for (let i = 0; i < DECOYS.length; i++) {
        const d = DECOYS[i];
        const userId = randomUUID();
        decoyUserIdByEmailLocal.set(d.emailLocal, userId);

        await tx.insert(user).values({
          id: userId,
          email: d.email,
          name: d.name,
          emailVerified: true,
          image: d.image,
        });

        await tx.insert(profile).values({
          userId,
          username: d.username,
          locale: 'ca',
          totalCo2Saved: d.totalCo2Saved,
          xpPoints: d.xpPoints,
          ridesAsDriver: d.ridesAsDriver,
          ridesAsPassenger: d.ridesAsPassenger,
          badges: d.badgeIds.map((id) => ({ id, awardedAt: nowIso })),
        });

        const carId = randomUUID();
        decoyCarIdByEmailLocal.set(d.emailLocal, carId);
        await tx.insert(cars).values({
          id: carId,
          userId,
          modelId: carModelRows[i % carModelRows.length].id,
          plate: d.plate,
          color: ['black', 'white', 'silver', 'blue'][i % 4],
          passengerSeats: 4,
        });
      }

      // Decoy trips. tripKey -> spec.
      const tripIdByKey = new Map<string, string>();
      const tripDataByKey: Record<
        string,
        {
          driverEmailLocal: 'marta' | 'pol' | 'noa' | 'roger';
          originLabel: string;
          originLat: number;
          originLng: number;
          destinationLabel: string;
          destinationLat: number;
          destinationLng: number;
          polyline: string | null;
        }
      > = {
        A: {
          driverEmailLocal: 'marta',
          originLabel:
            "Facultat d'Informàtica de Barcelona, Carrer de Dulcet, 08034 Barcelona",
          originLat: 41.3894674,
          originLng: 2.1133622,
          destinationLabel: 'Valldoreix, Sant Cugat del Vallès',
          destinationLat: 41.4574698,
          destinationLng: 2.0476516,
          polyline: POLYLINE_FIB_TO_VALLDOREIX,
        },
        B: {
          driverEmailLocal: 'pol',
          originLabel: 'Campus Nord UPC, Zona Universitària, 08034 Barcelona',
          originLat: 41.3880839,
          originLng: 2.1142634,
          destinationLabel: 'Volpelleres, Sant Cugat del Vallès',
          destinationLat: 41.4815474,
          destinationLng: 2.0727591,
          polyline: POLYLINE_CAMPUS_NORD_TO_VOLPELLERES,
        },
        C: {
          driverEmailLocal: 'noa',
          originLabel: 'Edifici K2M, Carrer de Jordi Girona, 08034 Barcelona',
          originLat: 41.3895,
          originLng: 2.1134,
          destinationLabel:
            'Palau de la Música Catalana, Carrer del Palau de la Música 4-6, 08003 Barcelona',
          destinationLat: 41.3876,
          destinationLng: 2.1752,
          polyline: POLYLINE_K2M_TO_PALAU,
        },
        D: {
          driverEmailLocal: 'noa',
          originLabel: 'Edifici K2M, Carrer de Jordi Girona, 08034 Barcelona',
          originLat: 41.3895,
          originLng: 2.1134,
          destinationLabel:
            'Basílica de la Sagrada Família, Carrer de Mallorca 401, 08013 Barcelona',
          destinationLat: 41.4035,
          destinationLng: 2.1744,
          polyline: POLYLINE_K2M_TO_SAGRADA,
        },
      };

      if (!skipTripE) {
        tripDataByKey.E = {
          driverEmailLocal: 'roger',
          originLabel: 'Edifici K2M, Carrer de Jordi Girona, 08034 Barcelona',
          originLat: 41.3895,
          originLng: 2.1134,
          destinationLabel: CULTUCAT_VENUE_LABEL,
          destinationLat: CULTUCAT_VENUE_LAT,
          destinationLng: CULTUCAT_VENUE_LNG,
          polyline: null,
        };
      }

      for (const [key, t] of Object.entries(tripDataByKey)) {
        const driverId = decoyUserIdByEmailLocal.get(t.driverEmailLocal);
        const carId = decoyCarIdByEmailLocal.get(t.driverEmailLocal);
        if (!driverId || !carId) {
          throw new Error(`Missing decoy driver/car for ${t.driverEmailLocal}`);
        }
        const tripId = randomUUID();
        tripIdByKey.set(key, tripId);

        await tx.insert(trips).values({
          id: tripId,
          driverId,
          carId,
          type: 'sporadic',
          status: 'active',
          originLabel: t.originLabel,
          originLat: t.originLat,
          originLng: t.originLng,
          destinationLabel: t.destinationLabel,
          destinationLat: t.destinationLat,
          destinationLng: t.destinationLng,
          seatsOffered: 3,
          routePolyline: t.polyline,
        });
      }

      // Decoy rides — today, Europe/Madrid.
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = now.getUTCMonth() + 1;
      const day = now.getUTCDate();

      let ridesInserted = 0;
      for (const r of RIDE_SPECS) {
        const tripId = tripIdByKey.get(r.tripKey);
        if (!tripId) continue; // skipped trip E
        const trip = tripDataByKey[r.tripKey];
        const departure = madridLocalToUtc(year, month, day, r.hour, r.minute);

        await tx.insert(rides).values({
          id: randomUUID(),
          tripId,
          scheduledDeparture: departure,
          status: 'active',
          originLabel: trip.originLabel,
          originLat: trip.originLat,
          originLng: trip.originLng,
          destinationLabel: trip.destinationLabel,
          destinationLat: trip.destinationLat,
          destinationLng: trip.destinationLng,
          totalDistanceKm: distanceForTrip(r.tripKey),
          seatsOffered: 3,
          seatsOccupied: 0,
        });
        ridesInserted++;
      }

      console.log(
        `[demo-reset] inserted ${DECOYS.length} decoys, ${Object.keys(tripDataByKey).length} trips, ${ridesInserted} rides`,
      );
    });

    // Post-run sanity (plan §5.4).
    const [tripCount] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(trips);
    const [rideCount] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(rides);
    const [bookingCount] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(bookings);
    const [decoyCount] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(user)
      .where(sql`${user.email} LIKE '%@cogo.demo'`);

    console.log('\n[demo-reset] sanity counts:');
    console.log(`  trips    = ${tripCount.n}`);
    console.log(`  rides    = ${rideCount.n}`);
    console.log(`  bookings = ${bookingCount.n}`);
    console.log(`  decoys   = ${decoyCount.n}`);
    console.log('\n[demo-reset] done.');
  } catch (err) {
    console.error(
      '[demo-reset] FAILED:',
      err instanceof Error ? err.stack : err,
    );
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

function distanceForTrip(key: 'A' | 'B' | 'C' | 'D' | 'E'): number {
  switch (key) {
    case 'A':
      return 12.64; // FIB → Valldoreix (OSRM)
    case 'B':
      return 14.01; // Campus Nord UPC → Volpelleres (OSRM)
    case 'C':
      return 6.12;
    case 'D':
      return 6.48;
    case 'E':
      return 6.5; // Approximate — operator can adjust; only used for display.
  }
}

void main();
