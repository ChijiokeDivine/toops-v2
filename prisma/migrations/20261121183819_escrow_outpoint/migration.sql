-- AlterTable
ALTER TABLE "DualMatch" ADD COLUMN     "escrowOutpoint" TEXT,
ADD COLUMN     "escrowParams" JSONB;

-- AlterTable
ALTER TABLE "MinesMatch" ADD COLUMN     "escrowOutpoint" TEXT,
ADD COLUMN     "escrowParams" JSONB;
