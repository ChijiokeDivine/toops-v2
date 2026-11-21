-- Roulette: shared-pool colour wheel (7 red, 7 black, 1 green).

CREATE TYPE "RouletteOutcome" AS ENUM ('RED', 'BLACK', 'GREEN');
CREATE TYPE "RouletteStatus" AS ENUM ('BETTING', 'SETTLED', 'CANCELLED');

CREATE TABLE "RouletteRound" (
    "id" TEXT NOT NULL,
    "status" "RouletteStatus" NOT NULL DEFAULT 'BETTING',
    "potPusd" BIGINT NOT NULL DEFAULT 0,
    "outcome" "RouletteOutcome",
    "slot" INTEGER,
    "spins" INTEGER NOT NULL DEFAULT 0,
    "serverSeed" TEXT NOT NULL,
    "serverSeedHash" TEXT NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "RouletteRound_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RouletteBet" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "outcome" "RouletteOutcome" NOT NULL,
    "amountPusd" BIGINT NOT NULL,
    "payoutPusd" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouletteBet_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RouletteRound_status_closesAt_idx" ON "RouletteRound"("status", "closesAt");
CREATE INDEX "RouletteRound_status_endedAt_idx" ON "RouletteRound"("status", "endedAt");
CREATE UNIQUE INDEX "RouletteBet_roundId_userId_key" ON "RouletteBet"("roundId", "userId");
CREATE INDEX "RouletteBet_userId_createdAt_idx" ON "RouletteBet"("userId", "createdAt");

ALTER TABLE "RouletteBet"
ADD CONSTRAINT "RouletteBet_roundId_fkey"
FOREIGN KEY ("roundId") REFERENCES "RouletteRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RouletteBet"
ADD CONSTRAINT "RouletteBet_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
