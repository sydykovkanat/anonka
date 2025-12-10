import { Injectable, Logger } from '@nestjs/common';
import { ContentType, User } from '@prisma/generated';
import { Bot } from 'grammy';
import { Message } from 'grammy/types';
import { UserService } from '../../user/user.service';
import { MyContext } from '../types';

export interface ExtractedContent {
  contentType: ContentType;
  content: string | undefined;
  fileId: string | undefined;
}

@Injectable()
export class TelegramContentService {
  private readonly logger = new Logger(TelegramContentService.name);
  private bot!: Bot<MyContext>;
  private adminUsername!: string;
  private groupChatId: bigint | null = null;
  private botUsername: string = '';

  setBot(bot: Bot<MyContext>) {
    this.bot = bot;
  }

  setAdminUsername(adminUsername: string) {
    this.adminUsername = adminUsername;
  }

  setGroupChatId(groupChatId: bigint | null) {
    this.groupChatId = groupChatId;
  }

  setBotUsername(botUsername: string) {
    this.botUsername = botUsername;
  }

  constructor(private userService: UserService) {}

  validateMessageType(msg: Message): { isValid: boolean; errorMessage?: string } {
    if (msg.sticker) {
      return {
        isValid: false,
        errorMessage: '❌ Отправка стикеров запрещена. Пожалуйста, отправьте текст, фото, видео, документ или голосовое сообщение.',
      };
    }
    if (msg.animation) {
      return {
        isValid: false,
        errorMessage: '❌ Отправка GIF запрещена. Пожалуйста, отправьте текст, фото, видео, документ или голосовое сообщение.',
      };
    }
    return { isValid: true };
  }

  extractMessageContent(msg: Message): ExtractedContent {
    if (msg.text) {
      return {
        contentType: ContentType.TEXT,
        content: msg.text,
        fileId: undefined,
      };
    }
    if (msg.photo) {
      const photo = msg.photo[msg.photo.length - 1];
      return {
        contentType: ContentType.PHOTO,
        content: msg.caption,
        fileId: photo.file_id,
      };
    }
    if (msg.video) {
      return {
        contentType: ContentType.VIDEO,
        content: msg.caption,
        fileId: msg.video.file_id,
      };
    }
    if (msg.document) {
      return {
        contentType: ContentType.DOCUMENT,
        content: msg.caption,
        fileId: msg.document.file_id,
      };
    }
    if (msg.sticker) {
      return {
        contentType: ContentType.STICKER,
        content: undefined,
        fileId: msg.sticker.file_id,
      };
    }
    if (msg.voice) {
      return {
        contentType: ContentType.VOICE,
        content: undefined,
        fileId: msg.voice.file_id,
      };
    }
    if (msg.video_note) {
      return {
        contentType: ContentType.VIDEO_NOTE,
        content: undefined,
        fileId: msg.video_note.file_id,
      };
    }
    if (msg.animation) {
      return {
        contentType: ContentType.ANIMATION,
        content: msg.caption,
        fileId: msg.animation.file_id,
      };
    }

    return {
      contentType: ContentType.TEXT,
      content: 'Неподдерживаемый тип сообщения',
      fileId: undefined,
    };
  }

  async sendMessageToUser(
    telegramId: bigint,
    messageId: number,
    contentType: ContentType,
    content: string | undefined,
    fileId: string | undefined,
    isAnonymous: boolean,
    sender: User,
  ) {
    const prefix = isAnonymous
      ? '📨 Вам пришло анонимное сообщение:\n\n'
      : `📨 Вам пришло сообщение от ${sender.firstName} ${sender.lastName}:\n\n`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '💬 Ответить', callback_data: `reply_${messageId}` }],
      ],
    };

    await this.sendContent(
      telegramId.toString(),
      contentType,
      content,
      fileId,
      prefix,
      keyboard,
    );
  }

  async sendReplyNotification(
    telegramId: bigint,
    messageId: number,
    contentType: ContentType,
    content: string | undefined,
    fileId: string | undefined,
    isAnonymous: boolean,
    sender: User,
  ) {
    const prefix = isAnonymous
      ? '💬 Вам пришёл анонимный ответ:\n\n'
      : `💬 Вам ответил ${sender.firstName} ${sender.lastName}:\n\n`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '💬 Ответить', callback_data: `reply_${messageId}` }],
      ],
    };

    await this.sendContent(
      telegramId.toString(),
      contentType,
      content,
      fileId,
      prefix,
      keyboard,
    );
  }

  async sendToAdminForModeration(
    messageId: number,
    sender: User,
    contentType: ContentType,
    content: string | undefined,
    fileId: string | undefined,
    isAnonymous: boolean,
  ) {
    const adminUser = await this.userService.findByUsername(this.adminUsername);
    if (!adminUser) {
      this.logger.error('Admin user not found');
      return;
    }

    const prefix =
      `🔔 Новое сообщение на модерацию\n\n` +
      `От: ${sender.firstName} ${sender.lastName} (@${sender.usernameOriginal})\n` +
      `Тип: ${isAnonymous ? 'Анонимное' : 'От имени автора'}\n\n` +
      `Сообщение:\n`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '✅ Одобрить', callback_data: `approve_${messageId}` }],
        [{ text: '❌ Отклонить', callback_data: `reject_${messageId}` }],
        [
          {
            text: '❌ Отклонить с причиной',
            callback_data: `reject_reason_${messageId}`,
          },
        ],
        [
          {
            text: '✏️ Запросить редактирование',
            callback_data: `request_edit_${messageId}`,
          },
        ],
      ],
    };

    await this.sendContent(
      adminUser.telegramId.toString(),
      contentType,
      content,
      fileId,
      prefix,
      keyboard,
    );
  }

  async sendContent(
    chatId: string,
    contentType: ContentType,
    content: string | undefined,
    fileId: string | undefined,
    prefix: string,
    keyboard?: any,
  ) {
    const fullText = prefix + (content || '');

    switch (contentType) {
      case ContentType.TEXT:
        await this.bot.api.sendMessage(chatId, fullText, {
          reply_markup: keyboard,
        });
        break;
      case ContentType.PHOTO:
        await this.bot.api.sendPhoto(chatId, fileId!, {
          caption: fullText,
          reply_markup: keyboard,
        });
        break;
      case ContentType.VIDEO:
        await this.bot.api.sendVideo(chatId, fileId!, {
          caption: fullText,
          reply_markup: keyboard,
        });
        break;
      case ContentType.DOCUMENT:
        await this.bot.api.sendDocument(chatId, fileId!, {
          caption: fullText,
          reply_markup: keyboard,
        });
        break;
      case ContentType.STICKER:
        await this.bot.api.sendMessage(chatId, prefix, {
          reply_markup: keyboard,
        });
        await this.bot.api.sendSticker(chatId, fileId!);
        break;
      case ContentType.VOICE:
        await this.bot.api.sendVoice(chatId, fileId!, {
          caption: prefix,
          reply_markup: keyboard,
        });
        break;
      case ContentType.VIDEO_NOTE:
        await this.bot.api.sendMessage(chatId, prefix, {
          reply_markup: keyboard,
        });
        await this.bot.api.sendVideoNote(chatId, fileId!);
        break;
      case ContentType.ANIMATION:
        await this.bot.api.sendAnimation(chatId, fileId!, {
          caption: fullText,
          reply_markup: keyboard,
        });
        break;
    }
  }

  async publishAnonymousToGroup(
    messageId: number,
    contentType: ContentType,
    content: string | undefined,
    fileId: string | undefined,
    parentContent?: string | null,
  ): Promise<number | null> {
    if (!this.groupChatId) {
      this.logger.error('Group chat ID not configured');
      return null;
    }

    // Если это ответ — показываем оригинальное сообщение
    let replyQuote = '';
    if (parentContent) {
      const originalText =
        parentContent.length > 100
          ? parentContent.substring(0, 100) + '...'
          : parentContent;
      replyQuote = `↩️ В ответ на: "${originalText}"\n\n`;
    }

    const prefix = `📢 Анонимное сообщение:\n\n${replyQuote}`;
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
      const sentMsg = await this.sendContentToGroup(
        this.groupChatId.toString(),
        contentType,
        content,
        fileId,
        prefix,
        keyboard,
      );
      return sentMsg?.message_id || null;
    } catch (error) {
      this.logger.error('Failed to publish anonymous message:', error);
      return null;
    }
  }

  async publishNamedToGroup(
    messageId: number,
    sender: User,
    contentType: ContentType,
    content: string | undefined,
    fileId: string | undefined,
    parentContent?: string | null,
  ): Promise<number | null> {
    if (!this.groupChatId) {
      this.logger.error('Group chat ID not configured');
      return null;
    }

    let replyQuote = '';
    if (parentContent) {
      const originalText =
        parentContent.length > 100
          ? parentContent.substring(0, 100) + '...'
          : parentContent;
      replyQuote = `↩️ В ответ на: "${originalText}"\n\n`;
    }

    const prefix = `📢 Сообщение от [${sender.firstName} ${sender.lastName}](tg://user?id=${sender.telegramId}):\n\n${replyQuote}`;
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
      const sentMsg = await this.sendContentToGroup(
        this.groupChatId.toString(),
        contentType,
        content,
        fileId,
        prefix,
        keyboard,
      );
      return sentMsg?.message_id || null;
    } catch (error) {
      this.logger.error('Failed to publish named message:', error);
      return null;
    }
  }

  async sendContentToGroup(
    chatId: string,
    contentType: ContentType,
    content: string | undefined,
    fileId: string | undefined,
    prefix: string,
    keyboard?: any,
  ) {
    const fullText = prefix + (content || '');

    switch (contentType) {
      case ContentType.TEXT:
        return this.bot.api.sendMessage(chatId, fullText, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      case ContentType.PHOTO:
        return this.bot.api.sendPhoto(chatId, fileId!, {
          caption: fullText,
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      case ContentType.VIDEO:
        return this.bot.api.sendVideo(chatId, fileId!, {
          caption: fullText,
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      case ContentType.DOCUMENT:
        return this.bot.api.sendDocument(chatId, fileId!, {
          caption: fullText,
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      case ContentType.STICKER:
        await this.bot.api.sendMessage(chatId, prefix, {
          parse_mode: 'Markdown',
        });
        return this.bot.api.sendSticker(chatId, fileId!);
      case ContentType.VOICE:
        return this.bot.api.sendVoice(chatId, fileId!, {
          caption: prefix,
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      case ContentType.VIDEO_NOTE:
        await this.bot.api.sendMessage(chatId, prefix, {
          parse_mode: 'Markdown',
        });
        return this.bot.api.sendVideoNote(chatId, fileId!);
      case ContentType.ANIMATION:
        return this.bot.api.sendAnimation(chatId, fileId!, {
          caption: fullText,
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
    }
  }
}
