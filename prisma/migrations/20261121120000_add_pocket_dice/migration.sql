-- Pocket Dice: shared-pot rounds with 2-10 players.

CREATE TYPE "PocketDiceStatus" AS ENUM ('WAITING', 'SETTLED', 'CANCELLED');

CREATE TABLE "PocketDiceMatch" (
    "id" TEXT NOT NULL,
    "status" "PocketDiceStatus" NOT NULL DEFAULT 'WAITING',
    "stakePusd" BIGINT NOT NULL,
    "potPusd" BIGINT NOT NULL DEFAULT 0,
    "die1" INTEGER,
    "die2" INTEGER,
    "roll" INTEGER,
    "exactHit" BOOLEAN NOT NULL DEFAULT false,
    "winningNumbers" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "serverSeed" TEXT NOT NULL,
    "serverSeedHash" TEXT NOT NULL,
    "nonce" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "PocketDiceMatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PocketDicePlayer" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pick" INTEGER NOT NULL,
    "payoutPusd" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PocketDicePlayer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PocketDiceMatch_status_stakePusd_startsAt_idx" ON "PocketDiceMatch"("status", "stakePusd", "startsAt");
CREATE UNIQUE INDEX "PocketDicePlayer_matchId_userId_key" ON "PocketDicePlayer"("matchId", "userId");
CREATE INDEX "PocketDicePlayer_userId_createdAt_idx" ON "PocketDicePlayer"("userId", "createdAt");

ALTER TABLE "PocketDicePlayer"
ADD CONSTRAINT "PocketDicePlayer_matchId_fkey"
FOREIGN KEY ("matchId") REFERENCES "PocketDiceMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PocketDicePlayer"
ADD CONSTRAINT "PocketDicePlayer_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
