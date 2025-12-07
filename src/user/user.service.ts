import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '@prisma/generated';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async findByTelegramId(telegramId: bigint): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { telegramId },
    });
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { username: username.toLowerCase().replace('@', '') },
    });
  }

  async findByLogin(login: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { login: login.toLowerCase() },
    });
  }

  async create(data: {
    telegramId: bigint;
    username: string;
    firstName: string;
    lastName: string;
    login: string;
    isAdmin?: boolean;
  }): Promise<User> {
    return this.prisma.user.create({
      data: {
        telegramId: data.telegramId,
        username: data.username.toLowerCase().replace('@', ''),
        usernameOriginal: data.username.replace('@', ''),
        firstName: data.firstName,
        lastName: data.lastName,
        login: data.login.toLowerCase(),
        isAdmin: data.isAdmin ?? false,
      },
    });
  }

  async incrementMessageCount(userId: number): Promise<User> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const lastMessageDate = user.lastMessageDate
      ? new Date(user.lastMessageDate)
      : null;
    lastMessageDate?.setHours(0, 0, 0, 0);

    const isNewDay = !lastMessageDate || lastMessageDate < today;

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        messageCount: isNewDay ? 1 : { increment: 1 },
        lastMessageDate: new Date(),
      },
    });
  }

  async canSendMessage(userId: number, maxPerDay: number): Promise<boolean> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) return false;

    const lastMessageDate = user.lastMessageDate
      ? new Date(user.lastMessageDate)
      : null;
    lastMessageDate?.setHours(0, 0, 0, 0);

    const isNewDay = !lastMessageDate || lastMessageDate < today;

    if (isNewDay) return true;

    return user.messageCount < maxPerDay;
  }

  async getRemainingMessages(
    userId: number,
    maxPerDay: number,
  ): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) return 0;

    const lastMessageDate = user.lastMessageDate
      ? new Date(user.lastMessageDate)
      : null;
    lastMessageDate?.setHours(0, 0, 0, 0);

    const isNewDay = !lastMessageDate || lastMessageDate < today;

    if (isNewDay) return maxPerDay;

    return Math.max(0, maxPerDay - user.messageCount);
  }
}
