import { Injectable, NestMiddleware, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class IdempotencyMiddleware implements NestMiddleware {
  private readonly logger = new Logger(IdempotencyMiddleware.name);

  constructor(private prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Only apply to mutating endpoints
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next();
    }

    const idempotencyKey = req.headers['idempotency-key'] as string;

    if (!idempotencyKey) {
      // Idempotency key is optional for now
      return next();
    }

    const wallet = (req as any).user?.wallet || 'anonymous';
    const endpoint = req.path;

    try {
      // Check if we've seen this key before
      const existingRecord = await this.prisma.idempotencyRecord.findUnique({
        where: { key: idempotencyKey },
      });

      if (existingRecord) {
        // Check if the request body matches (normalize JSON strings for comparison)
        const normalizeJson = (obj: any) => JSON.stringify(obj, Object.keys(obj || {}).sort());
        const requestBody = normalizeJson(req.body);
        const storedBody = normalizeJson(existingRecord.requestBody);

        if (requestBody !== storedBody) {
          // Conflict: same key, different payload
          this.logger.warn(`Idempotency conflict: key=${idempotencyKey}, wallet=${wallet}`);
          return res.status(HttpStatus.CONFLICT).json({
            statusCode: HttpStatus.CONFLICT,
            message: 'Idempotency key reused with different request body',
            error: 'IdempotencyConflict',
          });
        }

        // Return cached response
        this.logger.log(`Idempotency replay: key=${idempotencyKey}, wallet=${wallet}`);
        return res.status(HttpStatus.OK).json(existingRecord.response);
      }

      // Store a placeholder record synchronously to prevent race conditions
      // This ensures that concurrent requests with the same key will find this record
      try {
        await this.prisma.idempotencyRecord.create({
          data: {
            id: uuidv4(),
            key: idempotencyKey,
            wallet,
            endpoint,
            requestBody: req.body,
            response: {}, // Placeholder, will be updated after response
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
          },
        });
      } catch (error: any) {
        // If record already exists (race condition), check if it's the same request
        if (error.code === 'P2002') {
          const existingRecord = await this.prisma.idempotencyRecord.findUnique({
            where: { key: idempotencyKey },
          });

          if (existingRecord) {
            const normalizeJson = (obj: any) => JSON.stringify(obj, Object.keys(obj || {}).sort());
            const requestBody = normalizeJson(req.body);
            const storedBody = normalizeJson(existingRecord.requestBody);

            if (requestBody !== storedBody) {
              // Conflict: same key, different payload
              return res.status(HttpStatus.CONFLICT).json({
                statusCode: HttpStatus.CONFLICT,
                message: 'Idempotency key reused with different request body',
                error: 'IdempotencyConflict',
              });
            }

            // Same request, return cached response
            return res.status(HttpStatus.OK).json(existingRecord.response);
          }
        }
        // If it's not a unique constraint error, log it
        if (!error.message?.includes('Unique constraint')) {
          this.logger.error(`Failed to store idempotency record: ${error.message}`);
        }
      }

      // Store the original json method
      const originalJson = res.json.bind(res);

      // Override res.json to capture and update the response
      res.json = (body: any) => {
        // Update the record with the actual response asynchronously
        this.prisma.idempotencyRecord
          .update({
            where: { key: idempotencyKey },
            data: {
              response: body,
            },
          })
          .catch((error) => {
            this.logger.error(`Failed to update idempotency record: ${error.message}`);
          });

        return originalJson(body);
      };

      next();
    } catch (error) {
      this.logger.error(`Idempotency middleware error: ${error.message}`);
      next(); // Continue even if middleware fails
    }
  }
}
