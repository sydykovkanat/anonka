import { Injectable, Logger } from '@nestjs/common';
import { ContentType, MessageStatus, User } from '@prisma/generated';
import { Bot } from 'grammy';
import { MessageService } from '../../message/message.service';
import { UserService } from '../../user/user.service';
import { MyContext } from '../types';
import { TelegramContentService } from './telegram-content.service';

@Injectable()
export class TelegramModerationService {
  private readonly logger = new Logger(TelegramModerationService.name);
  private bot!: Bot<MyContext>;
  private groupChatId: bigint | null = null;
  private botUsername: string = '';

  constructor(
    private messageService: MessageService,
    private userService: UserService,
    private contentService: TelegramContentService,
  ) {}

  setBot(bot: Bot<MyContext>) {
    this.bot = bot;
  }

  setGroupChatId(groupChatId: bigint | null) {
    this.groupChatId = groupChatId;
  }

  setBotUsername(botUsername: string) {
    this.botUsername = botUsername;
  }

  async handleApprove(ctx: MyContext, messageId: number) {
    const message = await this.messageService.findByIdWithSender(messageId);
    if (!message) {
      await ctx.reply('❌ Сообщение не найдено.');
      return;
    }

    await this.messageService.updateStatus(messageId, MessageStatus.APPROVED);

    if (this.groupChatId) {
      const senderUser = await this.userService.findByUsername(
        message.sender.username,
      );

      // Если это ответ — показываем оригинальное сообщение
      let replyQuote = '';
      if (message.parentId && message.parent?.content) {
        const originalText =
          message.parent.content.length > 100
            ? message.parent.content.substring(0, 100) + '...'
            : message.parent.content;
        replyQuote = `↩️ В ответ на: "${originalText}"\n\n`;
      }

      let prefix: string;
      if (message.isAnonymous) {
        prefix = `📢 Анонимное сообщение:\n\n${replyQuote}`;
      } else if (senderUser) {
        prefix = `📢 Сообщение от [${message.sender.firstName} ${message.sender.lastName}](tg://user?id=${senderUser.telegramId}):\n\n${replyQuote}`;
      } else {
        prefix = `📢 Сообщение от ${message.sender.firstName} ${message.sender.lastName}:\n\n${replyQuote}`;
      }

      const keyboard = {
        inline_keyboard: [
          [
            {
              text: '💬 Ответить',
              url: `https://t.me/${this.botUsername}?start=reply_${messageId}`,
            },
          ],
        ],
      };

      try {
        const sentMsg = await this.contentService.sendContentToGroup(
          this.groupChatId.toString(),
          message.contentType as ContentType,
          message.content || undefined,
          message.fileId || undefined,
          prefix,
          keyboard,
        );

        if (sentMsg) {
          await this.messageService.updateTelegramMsgId(
            messageId,
            BigInt(sentMsg.message_id),
          );
        }
      } catch (error) {
        this.logger.error('Failed to send to group:', error);
      }
    }

    const sender = await this.userService.findByUsername(
      message.sender.username,
    );
    if (sender) {
      await this.bot.api.sendMessage(
        sender.telegramId.toString(),
        '✅ Ваше сообщение в группу было одобрено и опубликовано!',
      );
    }

    await ctx.reply('✅ Сообщение одобрено и опубликовано в группе.');
  }

  async handleReject(ctx: MyContext, messageId: number) {
    await this.messageService.updateStatus(messageId, MessageStatus.REJECTED);

    const message = await this.messageService.findByIdWithSender(messageId);
    if (message) {
      const sender = await this.userService.findByUsername(
        message.sender.username,
      );
      if (sender) {
        await this.bot.api.sendMessage(
          sender.telegramId.toString(),
          '❌ Ваше сообщение в группу было отклонено.',
        );
      }
    }

    await ctx.reply('✅ Сообщение отклонено.');
  }

  async handleViewAuthor(
    ctx: MyContext,
    messageId: number,
    ensureUser: (ctx: MyContext) => Promise<User | null>,
  ) {
    const user = await ensureUser(ctx);
    if (!user || !user.isAdmin) {
      await ctx.reply('⛔ Эта функция недоступна.');
      return;
    }

    const message = await this.messageService.findByIdWithSender(messageId);
    if (!message) {
      await ctx.reply('❌ Сообщение не найдено.');
      return;
    }

    await ctx.reply(
      `👤 Автор сообщения:\n\n` +
        `Имя: ${message.sender.firstName} ${message.sender.lastName}\n` +
        `Username: @${message.sender.usernameOriginal}`,
    );
  }

  async handleChatId(ctx: MyContext) {
    const chatId = ctx.chat?.id;
    const chatType = ctx.chat?.type;
    const chatTitle = (ctx.chat as any)?.title || 'Личный чат';

    await ctx.reply(
      `📋 Информация о чате:\n\n` +
        `ID: \`${chatId}\`\n` +
        `Тип: ${chatType}\n` +
        `Название: ${chatTitle}\n\n` +
        `Скопируй ID и добавь в .env файл:\n` +
        `\`GROUP_CHAT_ID=${chatId}\``,
      { parse_mode: 'Markdown' },
    );
  }

  async handleAdminCommand(
    ctx: MyContext,
    ensureUser: (ctx: MyContext) => Promise<User | null>,
  ) {
    const user = await ensureUser(ctx);
    if (!user || !user.isAdmin) {
      await ctx.reply('⛔ Эта команда недоступна.');
      return;
    }

    const pendingMessages = await this.messageService.getPendingMessages();

    if (pendingMessages.length === 0) {
      await ctx.reply('📭 Нет сообщений на модерации.');
      return;
    }

    await ctx.reply(`📋 Сообщений на модерации: ${pendingMessages.length}`);

    for (const msg of pendingMessages.slice(0, 5)) {
      const msgWithSender = await this.messageService.findByIdWithSender(
        msg.id,
      );
      if (msgWithSender) {
        const prefix =
          `🔔 Сообщение на модерацию\n\n` +
          `От: ${msgWithSender.sender.firstName} ${msgWithSender.sender.lastName}\n` +
          `Тип: ${msg.isAnonymous ? 'Анонимное' : 'От имени автора'}\n\n`;

        const keyboard = {
          inline_keyboard: [
            [{ text: '✅ Одобрить', callback_data: `approve_${msg.id}` }],
            [{ text: '❌ Отклонить', callback_data: `reject_${msg.id}` }],
            [
              {
                text: '❌ Отклонить с причиной',
                callback_data: `reject_reason_${msg.id}`,
              },
            ],
            [
              {
                text: '✏️ Запросить редактирование',
                callback_data: `request_edit_${msg.id}`,
              },
            ],
          ],
        };

        await this.contentService.sendContent(
          ctx.chat!.id.toString(),
          msg.contentType as ContentType,
          msg.content || undefined,
          msg.fileId || undefined,
          prefix,
          keyboard,
        );
      }
    }
  }
}
