import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from './database/database.service.js';

@Controller()
export class AppController {
  constructor(private readonly db: DatabaseService) {}

  @Get('health')
  health(): { status: string } {
    this.db.connection.prepare('SELECT 1').get();
    return { status: 'ok' };
  }
}
