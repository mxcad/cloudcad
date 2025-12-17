import { BadRequestException } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { CustomValidationPipe } from './validation.pipe';

describe('CustomValidationPipe', () => {
  let pipe: CustomValidationPipe;

  beforeEach(() => {
    pipe = new CustomValidationPipe();
  });

  describe('constructor', () => {
    it('should create a validation pipe with default options', () => {
      expect(pipe).toBeInstanceOf(CustomValidationPipe);
    });
  });

  describe('exceptionFactory', () => {
    it('should create BadRequestException with validation errors', async () => {
      const validationErrors: ValidationError[] = [
        {
          property: 'email',
          constraints: {
            isEmail: 'Invalid email format',
            isNotEmpty: 'Email should not be empty',
          },
        } as ValidationError,
        {
          property: 'password',
          constraints: {
            minLength: 'Password must be at least 6 characters',
          },
        } as ValidationError,
      ];

      // Create a test class to validate
      class TestDto {
        email!: string;
        password!: string;
      }

      // Use the pipe to transform and catch the exception
      try {
        await pipe.transform(
          { email: 'invalid', password: '123' },
          { type: TestDto, metatype: TestDto }
        );
      } catch (exception) {
        expect(exception).toBeInstanceOf(BadRequestException);
        const response = exception.getResponse();
        expect(response.code).toBe('VALIDATION_ERROR');
        expect(response.message).toBe('请求参数验证失败');
        expect(response.errors).toBeDefined();
      }
    });

    it('should handle validation error without constraints', async () => {
      class TestDto {
        field!: string;
      }

      try {
        await pipe.transform(
          { field: null },
          { type: TestDto, metatype: TestDto }
        );
      } catch (exception) {
        expect(exception).toBeInstanceOf(BadRequestException);
        const response = exception.getResponse();
        expect(response.code).toBe('VALIDATION_ERROR');
      }
    });
  });
});