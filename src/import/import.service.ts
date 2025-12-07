import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

interface ImportedUserData {
  id: number;
  first_name: string;
  last_name: string;
  login: string;
}

interface UsersJsonData {
  data: ImportedUserData[];
}

@Injectable()
export class ImportService implements OnModuleInit {
  private readonly logger = new Logger(ImportService.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.importUsersIfNeeded();
  }

  async importUsersIfNeeded(): Promise<void> {
    const count = await this.prisma.importedUser.count();

    if (count > 0) {
      this.logger.log(`Users already imported (${count} users). Skipping.`);
      return;
    }

    await this.importUsers();
  }

  async importUsers(): Promise<void> {
    const filePath = path.join(process.cwd(), 'users.json');

    if (!fs.existsSync(filePath)) {
      this.logger.warn('users.json not found. Skipping import.');
      return;
    }

    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const data: UsersJsonData = JSON.parse(fileContent);

      if (!data.data || !Array.isArray(data.data)) {
        this.logger.error('Invalid users.json format');
        return;
      }

      let imported = 0;
      let skipped = 0;

      for (const user of data.data) {
        if (!user.id || !user.login || !user.first_name || !user.last_name) {
          skipped++;
          continue;
        }

        try {
          await this.prisma.importedUser.upsert({
            where: { id: user.id },
            update: {
              login: user.login.toLowerCase(),
              firstName: user.first_name.trim(),
              lastName: user.last_name.trim(),
            },
            create: {
              id: user.id,
              login: user.login.toLowerCase(),
              firstName: user.first_name.trim(),
              lastName: user.last_name.trim(),
              imported: false,
            },
          });
          imported++;
        } catch (error) {
          this.logger.error(`Failed to import user ${user.login}: ${error}`);
          skipped++;
        }
      }

      this.logger.log(
        `Import completed: ${imported} users imported, ${skipped} skipped`,
      );
    } catch (error) {
      this.logger.error(`Failed to read users.json: ${error}`);
    }
  }

  async findByLogin(login: string) {
    return this.prisma.importedUser.findUnique({
      where: { login: login.toLowerCase() },
    });
  }

  async markAsImported(login: string) {
    return this.prisma.importedUser.update({
      where: { login: login.toLowerCase() },
      data: { imported: true },
    });
  }
}
