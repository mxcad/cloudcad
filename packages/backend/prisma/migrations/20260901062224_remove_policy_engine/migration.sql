/*
  Warnings:

  - You are about to drop the `permission_policies` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `policy_permissions` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "policy_permissions" DROP CONSTRAINT "policy_permissions_policyId_fkey";

-- DropTable
DROP TABLE "permission_policies";

-- DropTable
DROP TABLE "policy_permissions";

-- DropEnum
DROP TYPE "PolicyType";
