import { Injectable } from '@nestjs/common';
import { MessageStatus, MessageType } from '@prisma/generated';
import { MessageService } from '../../message/message.service';
import { UserService } from '../../user/user.service';
import { TelegramContentService } from '../services/telegram-content.service';
import { TelegramMenuService } from '../services/telegram-menu.service';
import { MyContext, MyConversation } from '../types';

@Injectable()
export class SendGroupMessageConversation {
  private maxMessagesPerDay: number = 100;
  private moderationEnabled: boolean = true;

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

  async run(conversation: MyConversation, ctx: MyContext) {
    const telegramUser = ctx.from;
    if (!telegramUser) {
      await ctx.reply(
        '❌ Ошибка: не удалось получить информацию о пользователе.',
      );
      return;
    }

    const user = await conversation.external(() =>
      this.userService.findByTelegramId(BigInt(telegramUser.id)),
    );
    if (!user) {
      await ctx.reply('Пожалуйста, начните с команды /start');
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

    await ctx.reply(
      '📢 Отправка сообщения в группу\n\n' +
        '🎭 Анонимно — никто не узнает автора, даже создатель бота. Публикуется сразу.\n\n' +
        '👤 От имени — сообщение пройдёт модерацию. Это для твоей же безопасности: чтобы случайно не спалиться, если хотел отправить анонимно.\n\n' +
        'Выбери тип:',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎭 Анонимно', callback_data: 'group_anon' }],
            [{ text: '👤 От моего имени', callback_data: 'group_named' }],
            [{ text: '❌ Отмена', callback_data: 'back_to_menu' }],
          ],
        },
      },
    );

    const typeResponse = await conversation.waitFor('callback_query:data');
    const isAnonymous = typeResponse.callbackQuery.data === 'group_anon';
    await typeResponse.answerCallbackQuery();

    if (typeResponse.callbackQuery.data === 'back_to_menu') {
      await this.menuService.showMainMenu(ctx);
      return;
    }

    await ctx.reply(
      '📝 Отправьте ваше сообщение (текст, фото, видео, документ, голосовое):',
    );

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

    await conversation.external(() =>
      this.userService.incrementMessageCount(user.id),
    );

    if (isAnonymous) {
      // Анонимные сообщения публикуются сразу
      const savedMessage = await conversation.external(() =>
        this.messageService.create({
          type: MessageType.GROUP,
          contentType,
          content,
          fileId,
          isAnonymous: true,
          senderId: user.id,
          status: MessageStatus.APPROVED,
        }),
      );

      const telegramMsgId = await conversation.external(() =>
        this.contentService.publishAnonymousToGroup(
          savedMessage.id,
          contentType,
          content,
          fileId,
        ),
      );

      if (telegramMsgId) {
        await conversation.external(() =>
          this.messageService.updateTelegramMsgId(
            savedMessage.id,
            BigInt(telegramMsgId),
          ),
        );
      }

      await ctx.reply(
        '✅ Сообщение опубликовано в группе!\n\n🔒 Никто не узнает, что это ты.',
      );
    } else {
      // Не анонимные сообщения: если модерация включена — на модерацию, иначе сразу публикуем
      if (this.moderationEnabled) {
        const savedMessage = await conversation.external(() =>
          this.messageService.create({
            type: MessageType.GROUP,
            contentType,
            content,
            fileId,
            isAnonymous: false,
            senderId: user.id,
            status: MessageStatus.PENDING,
          }),
        );

        await conversation.external(() =>
          this.contentService.sendToAdminForModeration(
            savedMessage.id,
            user,
            contentType,
            content,
            fileId,
            false,
          ),
        );

        await ctx.reply(
          '✅ Сообщение отправлено на модерацию.\n\nТы получишь уведомление о результате.',
        );
      } else {
        // Модерация выключена — публикуем сразу
        const savedMessage = await conversation.external(() =>
          this.messageService.create({
            type: MessageType.GROUP,
            contentType,
            content,
            fileId,
            isAnonymous: false,
            senderId: user.id,
            status: MessageStatus.APPROVED,
          }),
        );

        const telegramMsgId = await conversation.external(() =>
          this.contentService.publishNamedToGroup(
            savedMessage.id,
            user,
            contentType,
            content,
            fileId,
          ),
        );

        if (telegramMsgId) {
          await conversation.external(() =>
            this.messageService.updateTelegramMsgId(
              savedMessage.id,
              BigInt(telegramMsgId),
            ),
          );
        }

        await ctx.reply('✅ Сообщение опубликовано в группе!');
      }
    }

    await this.menuService.showMainMenu(ctx);
  }
}
