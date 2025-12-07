import { Injectable, Logger } from '@nestjs/common';
import { User } from '@prisma/generated';
import { Bot } from 'grammy';
import { ImportService } from '../../import/import.service';
import { UserService } from '../../user/user.service';
import { MyContext } from '../types';
import { TelegramMenuService } from './telegram-menu.service';

@Injectable()
export class TelegramAuthService {
  private readonly logger = new Logger(TelegramAuthService.name);
  private adminUsername: string = '';
  private bot!: Bot<MyContext>;
  private groupChatId: bigint | null = null;
  private groupChatLink: string | null = null;

  constructor(
    private userService: UserService,
    private importService: ImportService,
    private menuService: TelegramMenuService,
  ) {}

  setAdminUsername(adminUsername: string) {
    this.adminUsername = adminUsername;
  }

  setBot(bot: Bot<MyContext>) {
    this.bot = bot;
  }

  setGroupChatId(groupChatId: bigint | null) {
    this.groupChatId = groupChatId;
  }

  setGroupChatLink(groupChatLink: string | null) {
    this.groupChatLink = groupChatLink;
  }

  async isUserInGroup(telegramId: number): Promise<boolean> {
    if (!this.groupChatId) {
      // Если группа не настроена, пропускаем проверку
      return true;
    }

    try {
      const member = await this.bot.api.getChatMember(
        this.groupChatId.toString(),
        telegramId,
      );
      // member, administrator, creator - все OK
      // left, kicked - нет доступа
      return !['left', 'kicked'].includes(member.status);
    } catch (error) {
      this.logger.error(`Failed to check group membership: ${error}`);
      // В случае ошибки - не блокируем (может бот не админ в группе)
      return true;
    }
  }

  isNurUsername(username: string | undefined): boolean {
    if (!username) return false;
    return username.toLowerCase().startsWith('nur_');
  }

  extractLogin(username: string): string {
    const lower = username.toLowerCase();
    if (lower.startsWith('nur_')) {
      return lower.substring(4);
    }
    return lower;
  }

  async handleStart(ctx: MyContext) {
    const telegramUser = ctx.from;
    if (!telegramUser) {
      await ctx.reply('Не удалось получить информацию о пользователе.');
      return;
    }

    // Проверяем членство в группе
    const isInGroup = await this.isUserInGroup(telegramUser.id);
    if (!isInGroup) {
      const linkText = this.groupChatLink
        ? `\n\nПрисоединиться к группе: ${this.groupChatLink}`
        : '\n\nПрисоединитесь к группе и попробуйте снова.';
      await ctx.reply(
        '⛔ Доступ закрыт.\n\n' +
          'Для использования бота нужно быть участником группы.' +
          linkText,
      );
      return;
    }

    const existingUser = await this.userService.findByTelegramId(
      BigInt(telegramUser.id),
    );
    if (existingUser) {
      ctx.session.user = existingUser;
      await this.menuService.showMainMenu(ctx);
      return;
    }

    if (!this.isNurUsername(telegramUser.username)) {
      await ctx.reply(
        '⛔ Доступ запрещён.\n\n' +
          'Ваш username должен начинаться с префикса "nur_" (регистр не важен).\n\n' +
          'Пример: @nur_ivanov, @NUR_petrov, @Nur_Sidorov',
      );
      return;
    }

    const login = this.extractLogin(telegramUser.username!);
    const importedUser = await this.importService.findByLogin(login);

    if (!importedUser) {
      await ctx.reply(
        '⛔ Вы не найдены в списке участников.\n\n' +
          'Напишите создателю бота, если считаете что это ошибка.',
      );
      return;
    }

    const isAdmin =
      telegramUser.username!.toLowerCase() === this.adminUsername.toLowerCase();

    const newUser = await this.userService.create({
      telegramId: BigInt(telegramUser.id),
      username: telegramUser.username!,
      firstName: importedUser.firstName,
      lastName: importedUser.lastName,
      login: login,
      isAdmin,
    });

    await this.importService.markAsImported(login);

    ctx.session.user = newUser;

    await ctx.reply(
      `🎭 Добро пожаловать, ${importedUser.firstName}!\n\n` +
        'Это бот для анонимных сообщений. Я сам работаю оператором и гарантирую полную анонимность.\n\n' +
        '🔒 Анонимные сообщения публикуются сразу — я не вижу автора и не смогу его узнать даже при желании.\n\n' +
        '👤 Сообщения "от имени" проходят модерацию — это защита, чтобы ты случайно не спалился.',
      {
        reply_markup: this.menuService.getPersistentKeyboard(),
      },
    );

    await this.menuService.showMainMenu(ctx);
  }

  async handleMenu(ctx: MyContext) {
    const user = await this.ensureUser(ctx);
    if (!user) return;
    await this.menuService.showMainMenu(ctx);
  }

  async ensureUser(ctx: MyContext): Promise<User | null> {
    const telegramUser = ctx.from;
    if (!telegramUser) return null;

    // Проверяем членство в группе для каждого действия
    const isInGroup = await this.isUserInGroup(telegramUser.id);
    if (!isInGroup) {
      const linkText = this.groupChatLink
        ? `\n\nПрисоединиться к группе: ${this.groupChatLink}`
        : '\n\nПрисоединитесь к группе для продолжения использования бота.';
      await ctx.reply(
        '⛔ Доступ закрыт.\n\n' + 'Ты больше не участник группы.' + linkText,
      );
      return null;
    }

    if (ctx.session?.user) return ctx.session.user;

    const user = await this.userService.findByTelegramId(
      BigInt(telegramUser.id),
    );
    if (user) {
      if (ctx.session) {
        ctx.session.user = user;
      }
      return user;
    }

    await ctx.reply('Пожалуйста, начните с команды /start');
    return null;
  }
}
