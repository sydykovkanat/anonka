import { Injectable } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/generated';

@Injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    const connectionString = `postgresql://ononimka:ononimka@localhost:5434/ononimka?schema=public`;

    const adapter = new PrismaPg({ connectionString });
    super({ adapter });
  }
}
