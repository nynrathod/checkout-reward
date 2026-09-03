import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { CartsModule } from './carts/carts.module.js';
import { loadConfig } from './config/configuration.js';
import { DatabaseModule } from './database/database.module.js';
import { ProductsModule } from './products/products.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [loadConfig] }),
    DatabaseModule,
    ProductsModule,
    CartsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
