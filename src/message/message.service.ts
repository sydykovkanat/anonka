import { Injectable } from '@nestjs/common';
import {
  ContentType,
  Message,
  MessageStatus,
  MessageType,
} from '@prisma/generated';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MessageService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    type: MessageType;
    contentType: ContentType;
    content?: string;
    fileId?: string;
    isAnonymous: boolean;
    senderId: number;
    receiverId?: number;
    parentId?: number;
    status?: MessageStatus;
  }): Promise<Message> {
    return this.prisma.message.create({
      data: {
        type: data.type,
        contentType: data.contentType,
        content: data.content,
        fileId: data.fileId,
        isAnonymous: data.isAnonymous,
        senderId: data.senderId,
        receiverId: data.receiverId,
        parentId: data.parentId,
        status: data.status ?? MessageStatus.DELIVERED,
      },
    });
  }

  async findById(id: number): Promise<Message | null> {
    return this.prisma.message.findUnique({
      where: { id },
      include: {
        sender: true,
        receiver: true,
        parent: true,
      },
    });
  }

  async findByIdWithSender(id: number): Promise<
    | (Message & {
        sender: {
          firstName: string;
          lastName: string;
          username: string;
          usernameOriginal: string;
        };
        parent?: {
          content: string | null;
        } | null;
      })
    | null
  > {
    return this.prisma.message.findUnique({
      where: { id },
      include: {
        sender: {
          select: {
            firstName: true,
            lastName: true,
            username: true,
            usernameOriginal: true,
          },
        },
        parent: {
          select: {
            content: true,
          },
        },
      },
    });
  }

  async updateStatus(
    id: number,
    status: MessageStatus,
    rejectReason?: string,
  ): Promise<Message> {
    return this.prisma.message.update({
      where: { id },
      data: {
        status,
        rejectReason,
      },
    });
  }

  async updateTelegramMsgId(
    id: number,
    telegramMsgId: bigint,
  ): Promise<Message> {
    return this.prisma.message.update({
      where: { id },
      data: { telegramMsgId },
    });
  }

  async getPendingMessages(): Promise<Message[]> {
    return this.prisma.message.findMany({
      where: {
        type: MessageType.GROUP,
        status: MessageStatus.PENDING,
      },
      include: {
        sender: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getConversation(messageId: number): Promise<Message[]> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) return [];

    let rootId = message.id;
    let current = message;

    while (current.parentId) {
      const parent = await this.prisma.message.findUnique({
        where: { id: current.parentId },
      });
      if (!parent) break;
      rootId = parent.id;
      current = parent;
    }

    const getAllReplies = async (parentId: number): Promise<Message[]> => {
      const replies = await this.prisma.message.findMany({
        where: { parentId },
        include: { sender: true, receiver: true },
        orderBy: { createdAt: 'asc' },
      });

      const allReplies: Message[] = [];
      for (const reply of replies) {
        allReplies.push(reply);
        const nested = await getAllReplies(reply.id);
        allReplies.push(...nested);
      }
      return allReplies;
    };

    const root = await this.prisma.message.findUnique({
      where: { id: rootId },
      include: { sender: true, receiver: true },
    });

    if (!root) return [];

    const replies = await getAllReplies(rootId);
    return [root, ...replies];
  }
}
