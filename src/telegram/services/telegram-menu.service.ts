import { Injectable } from '@nestjs/common';
import { UserService } from '../../user/user.service';
import { MyContext } from '../types';

// Постоянная клавиатура внизу экрана
const PERSISTENT_KEYBOARD = {
  keyboard: [
    [{ text: '✉️ Личное сообщение' }, { text: '📢 В группу' }],
    [{ text: '📬 Меню' }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

@Injectable()
export class TelegramMenuService {
  private maxMessagesPerDay: number = 100;

  constructor(private userService: UserService) {}

  setMaxMessagesPerDay(max: number) {
    this.maxMessagesPerDay = max;
  }

  getPersistentKeyboard() {
    return PERSISTENT_KEYBOARD;
  }

  async showMainMenu(ctx: MyContext) {
    const telegramUser = ctx.from;
    if (!telegramUser) {
      await ctx.reply('Пожалуйста, начните с команды /start');
      return;
    }

    const user = await this.userService.findByTelegramId(
      BigInt(telegramUser.id),
    );
    if (!user) {
      await ctx.reply('Пожалуйста, начните с команды /start');
      return;
    }

    const remaining = await this.userService.getRemainingMessages(
      user.id,
      this.maxMessagesPerDay,
    );

    await ctx.reply(
      `📬 Главное меню\n\n` +
        `Осталось сообщений сегодня: ${remaining}/${this.maxMessagesPerDay}`,
      {
        reply_markup: PERSISTENT_KEYBOARD,
      },
    );
  }
}
