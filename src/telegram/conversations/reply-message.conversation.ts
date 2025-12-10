import { Injectable } from '@nestjs/common';
import { MessageStatus, MessageType } from '@prisma/generated';
import { MessageService } from '../../message/message.service';
import { UserService } from '../../user/user.service';
import { TelegramContentService } from '../services/telegram-content.service';
import { TelegramMenuService } from '../services/telegram-menu.service';
import { ConversationData, MyContext, MyConversation } from '../types';

@Injectable()
export class ReplyMessageConversation {
  private maxMessagesPerDay: number = 100;
  private moderationEnabled: boolean = true;
  private conversationDataGetter!: (
    chatId: number,
  ) => ConversationData | undefined;

  constructor(
    private userService: UserService,
    private messageService: MessageService,
    private contentService: TelegramContentService,
    private menuService: TelegramMenuService,
  ) {}

  setMaxMessagesPerDay(max: number) {
    this.maxMessagesPerDay = max;
  }

  setModerationEnabled(enabled: boolean) {
    this.moderationEnabled = enabled;
  }

  setConversationDataGetter(
    getter: (chatId: number) => ConversationData | undefined,
  ) {
    this.conversationDataGetter = getter;
  }

  async run(conversation: MyConversation, ctx: MyContext) {
    const telegramUser = ctx.from;
    const chatId = ctx.chat?.id;
    if (!telegramUser || !chatId) {
      await ctx.reply(
        '❌ Ошибка: не удалось получить информацию о пользователе.',
      );
      return;
    }

    // Get messageId from conversationData Map (workaround for grammyjs/conversations session issue)
    const messageId = this.conversationDataGetter(chatId)?.replyToMessageId;
    if (!messageId) {
      await ctx.reply('❌ Ошибка: не найдено сообщение для ответа.');
      await this.menuService.showMainMenu(ctx);
      return;
    }

    const user = await conversation.external(() =>
      this.userService.findByTelegramId(BigInt(telegramUser.id)),
    );
    if (!user) {
      await ctx.reply('Пожалуйста, начните с команды /start');
      return;
    }

    const originalMessage = await conversation.external(() =>
      this.messageService.findById(messageId),
    );
    if (!originalMessage) {
      await ctx.reply('❌ Сообщение не найдено.');
      await this.menuService.showMainMenu(ctx);
      return;
    }

    // Проверка: нельзя отвечать на своё сообщение
    if (originalMessage.senderId === user.id) {
      await ctx.reply('❌ Нельзя ответить на своё же сообщение.');
      await this.menuService.showMainMenu(ctx);
      return;
    }

    const canSend = await conversation.external(() =>
      this.userService.canSendMessage(user.id, this.maxMessagesPerDay),
    );
    if (!canSend) {
      await ctx.reply(
        '❌ Вы достигли лимита сообщений на сегодня (100). Попробуйте завтра.',
      );
      return;
    }

    // Показываем текст оригинального сообщения
    const originalText = originalMessage.content
      ? originalMessage.content.length > 200
        ? originalMessage.content.substring(0, 200) + '...'
        : originalMessage.content
      : '[медиа-контент]';

    await ctx.reply(
      `💬 Ответ на сообщение:\n\n"${originalText}"\n\nВыбери тип ответа:`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎭 Анонимно', callback_data: 'reply_anon' }],
            [{ text: '👤 От моего имени', callback_data: 'reply_named' }],
            [{ text: '❌ Отмена', callback_data: 'back_to_menu' }],
          ],
        },
      },
    );

    const typeResponse = await conversation.waitFor('callback_query:data');
    const isAnonymous = typeResponse.callbackQuery.data === 'reply_anon';
    await typeResponse.answerCallbackQuery();

    if (typeResponse.callbackQuery.data === 'back_to_menu') {
      await this.menuService.showMainMenu(ctx);
      return;
    }

    if (originalMessage.type === MessageType.GROUP) {
      await this.handleGroupMessageReply(
        conversation,
        ctx,
        user,
        originalMessage,
        messageId,
        isAnonymous,
      );
    } else {
      await this.handlePersonalMessageReply(
        conversation,
        ctx,
        user,
        originalMessage,
        messageId,
        isAnonymous,
      );
    }

    await this.menuService.showMainMenu(ctx);
  }

  private async handleGroupMessageReply(
    conversation: MyConversation,
    ctx: MyContext,
    user: any,
    originalMessage: any,
    messageId: number,
    isAnonymous: boolean,
  ) {
    await ctx.reply('Куда отправить ответ?', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📨 Автору в личку', callback_data: 'reply_to_author' }],
          [{ text: '📢 В группу', callback_data: 'reply_to_group' }],
          [{ text: '❌ Отмена', callback_data: 'back_to_menu' }],
        ],
      },
    });

    const destResponse = await conversation.waitFor('callback_query:data');
    await destResponse.answerCallbackQuery();

    if (destResponse.callbackQuery.data === 'back_to_menu') {
      await this.menuService.showMainMenu(ctx);
      return;
    }

    const replyToGroup = destResponse.callbackQuery.data === 'reply_to_group';

    await ctx.reply('📝 Отправьте ваш ответ:');
    const messageResponse = await conversation.wait();
    const msg = messageResponse.message;

    if (!msg) {
      await ctx.reply('❌ Не удалось получить сообщение.');
      await this.menuService.showMainMenu(ctx);
      return;
    }

    // Проверяем тип сообщения
    const validation = this.contentService.validateMessageType(msg);
    if (!validation.isValid) {
      await ctx.reply(validation.errorMessage!);
      await this.menuService.showMainMenu(ctx);
      return;
    }

    const { contentType, content, fileId } =
      this.contentService.extractMessageContent(msg);

    if (replyToGroup) {
      await conversation.external(() =>
        this.userService.incrementMessageCount(user.id),
      );

      if (isAnonymous) {
        // Анонимные ответы публикуются сразу
        const savedReply = await conversation.external(() =>
          this.messageService.create({
            type: MessageType.GROUP,
            contentType,
            content,
            fileId,
            isAnonymous: true,
            senderId: user.id,
            parentId: messageId,
            status: MessageStatus.APPROVED,
          }),
        );

        const telegramMsgId = await conversation.external(() =>
          this.contentService.publishAnonymousToGroup(
            savedReply.id,
            contentType,
            content,
            fileId,
            originalMessage.content,
          ),
        );

        if (telegramMsgId) {
          await conversation.external(() =>
            this.messageService.updateTelegramMsgId(
              savedReply.id,
              BigInt(telegramMsgId),
            ),
          );
        }

        await ctx.reply(
          '✅ Ответ опубликован в группе!\n\n🔒 Никто не узнает, что это ты.',
        );
      } else {
        // Не анонимные ответы: если модерация включена — на модерацию, иначе сразу публикуем
        if (this.moderationEnabled) {
          const savedReply = await conversation.external(() =>
            this.messageService.create({
              type: MessageType.GROUP,
              contentType,
              content,
              fileId,
              isAnonymous: false,
              senderId: user.id,
              parentId: messageId,
              status: MessageStatus.PENDING,
            }),
          );

          await conversation.external(() =>
            this.contentService.sendToAdminForModeration(
              savedReply.id,
              user,
              contentType,
              content,
              fileId,
              false,
            ),
          );

          await ctx.reply(
            '✅ Ответ отправлен на модерацию.\n\nТы получишь уведомление о результате.',
          );
        } else {
          // Модерация выключена — публикуем сразу
          const savedReply = await conversation.external(() =>
            this.messageService.create({
              type: MessageType.GROUP,
              contentType,
              content,
              fileId,
              isAnonymous: false,
              senderId: user.id,
              parentId: messageId,
              status: MessageStatus.APPROVED,
            }),
          );

          const telegramMsgId = await conversation.external(() =>
            this.contentService.publishNamedToGroup(
              savedReply.id,
              user,
              contentType,
              content,
              fileId,
              originalMessage.content,
            ),
          );

          if (telegramMsgId) {
            await conversation.external(() =>
              this.messageService.updateTelegramMsgId(
                savedReply.id,
                BigInt(telegramMsgId),
              ),
            );
          }

          await ctx.reply('✅ Ответ опубликован в группе!');
        }
      }
    } else {
      const savedReply = await conversation.external(() =>
        this.messageService.create({
          type: MessageType.PERSONAL,
          contentType,
          content,
          fileId,
          isAnonymous,
          senderId: user.id,
          receiverId: originalMessage.senderId,
          parentId: messageId,
        }),
      );

      await conversation.external(() =>
        this.userService.incrementMessageCount(user.id),
      );

      const msgWithSender = await conversation.external(() =>
        this.messageService.findByIdWithSender(originalMessage.id),
      );
      if (msgWithSender) {
        const originalSenderUser = await conversation.external(() =>
          this.userService.findByUsername(msgWithSender.sender.username),
        );
        if (originalSenderUser) {
          await conversation.external(() =>
            this.contentService.sendReplyNotification(
              originalSenderUser.telegramId,
              savedReply.id,
              contentType,
              content,
              fileId,
              isAnonymous,
              user,
            ),
          );
        }
      }

      await ctx.reply('✅ Ответ отправлен автору.');
    }
  }

  private async handlePersonalMessageReply(
    conversation: MyConversation,
    ctx: MyContext,
    user: any,
    originalMessage: any,
    messageId: number,
    isAnonymous: boolean,
  ) {
    await ctx.reply('📝 Отправьте ваш ответ:');
    const messageResponse = await conversation.wait();
    const msg = messageResponse.message;

    if (!msg) {
      await ctx.reply('❌ Не удалось получить сообщение.');
      await this.menuService.showMainMenu(ctx);
      return;
    }

    // Проверяем тип сообщения
    const validation = this.contentService.validateMessageType(msg);
    if (!validation.isValid) {
      await ctx.reply(validation.errorMessage!);
      await this.menuService.showMainMenu(ctx);
      return;
    }

    const { contentType, content, fileId } =
      this.contentService.extractMessageContent(msg);

    const savedReply = await conversation.external(() =>
      this.messageService.create({
        type: MessageType.PERSONAL,
        contentType,
        content,
        fileId,
        isAnonymous,
        senderId: user.id,
        receiverId: originalMessage.senderId,
        parentId: messageId,
      }),
    );

    await conversation.external(() =>
      this.userService.incrementMessageCount(user.id),
    );

    const msgWithSender = await conversation.external(() =>
      this.messageService.findByIdWithSender(originalMessage.id),
    );
    if (msgWithSender) {
      const senderUser = await conversation.external(() =>
        this.userService.findByUsername(msgWithSender.sender.username),
      );
      if (senderUser) {
        await conversation.external(() =>
          this.contentService.sendReplyNotification(
            senderUser.telegramId,
            savedReply.id,
            contentType,
            content,
            fileId,
            isAnonymous,
            user,
          ),
        );
      }
    }

    await ctx.reply('✅ Ответ отправлен!');
  }
}
