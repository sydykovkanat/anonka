import { Injectable } from '@nestjs/common';
import { MessageType } from '@prisma/generated';
import { ImportService } from '../../import/import.service';
import { MessageService } from '../../message/message.service';
import { UserService } from '../../user/user.service';
import { TelegramContentService } from '../services/telegram-content.service';
import { TelegramMenuService } from '../services/telegram-menu.service';
import { MyContext, MyConversation } from '../types';

@Injectable()
export class SendMessageConversation {
  private maxMessagesPerDay: number = 100;
  private botUsername: string = '';

  constructor(
    private userService: UserService,
    private messageService: MessageService,
    private importService: ImportService,
    private contentService: TelegramContentService,
    private menuService: TelegramMenuService,
  ) {}

  setMaxMessagesPerDay(max: number) {
    this.maxMessagesPerDay = max;
  }

  setBotUsername(username: string) {
    this.botUsername = username;
  }

  private isNurUsername(username: string | undefined): boolean {
    if (!username) return false;
    return username.toLowerCase().startsWith('nur_');
  }

  private extractLogin(username: string): string {
    const lower = username.toLowerCase();
    if (lower.startsWith('nur_')) {
      return lower.substring(4);
    }
    return lower;
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
      '📝 Введите username получателя (начинается с @nur_):\n\n' +
        'Например: @nur_ivanov',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Отмена', callback_data: 'back_to_menu' }],
          ],
        },
      },
    );

    const usernameResponse = await conversation.waitFor('message:text');
    const recipientUsername = usernameResponse.message.text.trim();

    if (!this.isNurUsername(recipientUsername.replace('@', ''))) {
      await ctx.reply('❌ Username должен начинаться с @nur_');
      await this.menuService.showMainMenu(ctx);
      return;
    }

    const recipientLogin = this.extractLogin(
      recipientUsername.replace('@', ''),
    );
    const importedRecipient = await conversation.external(() =>
      this.importService.findByLogin(recipientLogin),
    );

    if (!importedRecipient) {
      await ctx.reply('❌ Пользователь не найден.');
      await this.menuService.showMainMenu(ctx);
      return;
    }

    const recipient = await conversation.external(() =>
      this.userService.findByLogin(recipientLogin),
    );

    if (!recipient) {
      await ctx.reply(
        `⚠️ Пользователь ${importedRecipient.firstName} ${importedRecipient.lastName} ещё не зарегистрирован в боте.\n\n` +
          `Отправьте ему ссылку для регистрации: https://t.me/${this.botUsername}`,
      );
      await this.menuService.showMainMenu(ctx);
      return;
    }

    if (recipient.id === user.id) {
      await ctx.reply('❌ Нельзя отправить сообщение самому себе.');
      await this.menuService.showMainMenu(ctx);
      return;
    }

    await ctx.reply(
      `📨 Получатель: ${importedRecipient.firstName} ${importedRecipient.lastName}\n\n` +
        'Отправьте ваше сообщение (текст, фото, видео, документ, стикер, голосовое):',
    );

    const messageResponse = await conversation.wait();
    const msg = messageResponse.message;

    if (!msg) {
      await ctx.reply('❌ Не удалось получить сообщение.');
      await this.menuService.showMainMenu(ctx);
      return;
    }

    const { contentType, content, fileId } =
      this.contentService.extractMessageContent(msg);

    const savedMessage = await conversation.external(() =>
      this.messageService.create({
        type: MessageType.PERSONAL,
        contentType,
        content,
        fileId,
        isAnonymous: true,
        senderId: user.id,
        receiverId: recipient.id,
      }),
    );

    await conversation.external(() =>
      this.userService.incrementMessageCount(user.id),
    );

    await conversation.external(() =>
      this.contentService.sendMessageToUser(
        recipient.telegramId,
        savedMessage.id,
        contentType,
        content,
        fileId,
        true,
        user,
      ),
    );

    await ctx.reply(
      '✅ Сообщение отправлено анонимно!\n\n🔒 Получатель не узнает, кто ты.',
    );
    await this.menuService.showMainMenu(ctx);
  }
}
