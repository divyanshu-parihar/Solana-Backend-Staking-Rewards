import { HttpException, HttpStatus } from '@nestjs/common';

export class ProgramError extends HttpException {
  constructor(message: string, statusCode: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR) {
    super(
      {
        statusCode,
        message,
        error: 'ProgramError',
      },
      statusCode,
    );
  }
}
