import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.resolve(process.cwd(), '../../.env') });
loadEnv({ path: path.resolve(process.cwd(), '.env') });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const seedEmail = (
    process.env.SEED_USER_EMAIL ?? 'demo@example.com'
  ).toLowerCase();
  const seedPassword = process.env.SEED_USER_PASSWORD ?? 'Passw0rd!23';
  const seedOrgName = process.env.SEED_ORG_NAME ?? 'Demo Organization';
  const seedRole =
    (process.env.SEED_USER_ROLE as UserRole | undefined) ?? UserRole.OWNER;

  const existingUser = await prisma.user.findUnique({
    where: { email: seedEmail },
  });

  if (existingUser) {
    console.log(`Seed user already exists: ${seedEmail}`);
    return;
  }

  const passwordHash = await bcrypt.hash(seedPassword, 10);

  const organization = await prisma.organization.create({
    data: {
      name: seedOrgName,
    },
  });

  const user = await prisma.user.create({
    data: {
      email: seedEmail,
      passwordHash,
      role: seedRole,
      organizationId: organization.id,
    },
  });

  console.log('Seed complete');
  console.log(`Organization: ${organization.name} (${organization.id})`);
  console.log(`User: ${user.email}`);
  console.log(`Password: ${seedPassword}`);
}

void main()
  .catch((error) => {
    console.error('Seed failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
