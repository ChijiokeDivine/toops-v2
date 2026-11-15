-- Mines Duel: real-time two-player PvP mines.
-- Stakes are locked in the PUSD ledger before a match is created; settlement is
-- a single transaction that pays the winner and records the ledger entry.

ALTER TABLE "User"
ADD COLUMN "activeMinesMatchId" TEXT;

CREATE INDEX "User_activeMinesMatchId_idx" ON "User"("activeMinesMatchId");

CREATE TYPE "MinesMatchStatus" AS ENUM (
  'WAITING',
  'LIVE',
  'SETTLED',
  'CANCELLED'
);

CREATE TYPE "MinesWinReason" AS ENUM (
  'KNOCKOUT',
  'EXHAUSTION',
  'TIEBREAK_BOMBS',
  'TIEBREAK_SPEED'
);

CREATE TABLE "MinesTicket" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "stakePusd" BIGINT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MinesTicket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MinesTicket_userId_key" ON "MinesTicket"("userId");
CREATE INDEX "MinesTicket_stakePusd_expiresAt_idx" ON "MinesTicket"("stakePusd", "expiresAt");

ALTER TABLE "MinesTicket"
ADD CONSTRAINT "MinesTicket_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MinesMatch" (
  "id" TEXT NOT NULL,
  "status" "MinesMatchStatus" NOT NULL DEFAULT 'WAITING',
  "stakePusd" BIGINT NOT NULL,
  "potPusd" BIGINT NOT NULL,
  "feePusd" BIGINT NOT NULL DEFAULT 0,
  "payoutPusd" BIGINT NOT NULL DEFAULT 0,
  "winnerUserId" TEXT,
  "winnerSeat" INTEGER,
  "winReason" "MinesWinReason",
  "serverSeed" TEXT NOT NULL,
  "serverSeedHash" TEXT NOT NULL,
  "nonce" INTEGER NOT NULL DEFAULT 0,
  "clientSeed1" TEXT NOT NULL,
  "clientSeed2" TEXT NOT NULL,
  "board" TEXT NOT NULL,
  "shieldIndex" INTEGER,
  "hmacHex" TEXT NOT NULL,
  "state" JSONB,
  "startsAt" TIMESTAMP(3),
  "readyDeadlineAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "cancelReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MinesMatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MinesMatch_status_readyDeadlineAt_idx" ON "MinesMatch"("status", "readyDeadlineAt");
CREATE INDEX "MinesMatch_winnerUserId_idx" ON "MinesMatch"("winnerUserId");
CREATE INDEX "MinesMatch_createdAt_idx" ON "MinesMatch"("createdAt");

ALTER TABLE "MinesMatch"
ADD CONSTRAINT "MinesMatch_winnerUserId_fkey"
FOREIGN KEY ("winnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "MinesMatchPlayer" (
  "id" TEXT NOT NULL,
  "matchId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "seat" INTEGER NOT NULL,
  "stakePusd" BIGINT NOT NULL,
  "clientSeed" TEXT NOT NULL,
  "ready" BOOLEAN NOT NULL DEFAULT false,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "score" INTEGER NOT NULL DEFAULT 0,
  "streak" INTEGER NOT NULL DEFAULT 0,
  "bombsHit" INTEGER NOT NULL DEFAULT 0,
  "shieldsUsed" INTEGER NOT NULL DEFAULT 0,
  "clicks" INTEGER NOT NULL DEFAULT 0,
  "totalClickMs" INTEGER NOT NULL DEFAULT 0,
  "payoutPusd" BIGINT NOT NULL DEFAULT 0,

  CONSTRAINT "MinesMatchPlayer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MinesMatchPlayer_matchId_userId_key" ON "MinesMatchPlayer"("matchId", "userId");
CREATE UNIQUE INDEX "MinesMatchPlayer_matchId_seat_key" ON "MinesMatchPlayer"("matchId", "seat");
CREATE INDEX "MinesMatchPlayer_userId_idx" ON "MinesMatchPlayer"("userId");

ALTER TABLE "MinesMatchPlayer"
ADD CONSTRAINT "MinesMatchPlayer_matchId_fkey"
FOREIGN KEY ("matchId") REFERENCES "MinesMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MinesMatchPlayer"
ADD CONSTRAINT "MinesMatchPlayer_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
