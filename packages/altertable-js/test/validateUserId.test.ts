import { describe, expect, it } from 'vitest';

import { validateUserId } from '../src/lib/validateUserId';

describe('validateUserId', () => {
  it('should accept valid user IDs', () => {
    const validUserIds = [
      'user123',
      'john.doe@example.com',
      'customer_456',
      'test-user',
      'validUserId',
    ];

    validUserIds.forEach(userId => {
      expect(() => {
        validateUserId(userId);
      }).not.toThrow();
    });
  });

  it('should throw error for empty user ID', () => {
    expect(() => {
      validateUserId('');
    }).toThrow('User ID cannot be empty or contain only whitespace.');
  });

  it('should throw error for null user ID', () => {
    expect(() => {
      validateUserId(null as any);
    }).toThrow('User ID cannot be empty or contain only whitespace.');
  });

  it('should throw error for whitespace-only user ID', () => {
    expect(() => {
      validateUserId('   ');
    }).toThrow('User ID cannot be empty or contain only whitespace.');
  });

  it('should throw error for case-insensitive reserved user IDs', () => {
    const reservedIds = [
      'anonymous_id',
      'ANONYMOUS_ID',
      'Anonymous_Id',
      'user_id',
      'USER_ID',
      'User_Id',
      'visitor_id',
      'VISITOR_ID',
      'Visitor_Id',
    ];

    reservedIds.forEach(userId => {
      expect(() => {
        validateUserId(userId);
      }).toThrow(
        `User ID "${userId}" is a reserved identifier and cannot be used.`
      );
    });
  });

  it('should throw error for case-sensitive reserved user IDs', () => {
    const reservedIds = ['[object Object]', '0', 'NaN', 'none', 'None', 'null'];

    reservedIds.forEach(userId => {
      expect(() => {
        validateUserId(userId);
      }).toThrow(
        `User ID "${userId}" is a reserved identifier and cannot be used.`
      );
    });
  });

  it('should include reserved identifiers list in error message', () => {
    expect(() => validateUserId('anonymous_id')).toThrow(
      'List of reserved identifiers:'
    );
  });

  it('should allow similar but not exact matches for case-sensitive IDs', () => {
    const similarIds = ['object Object', '1', 'nan', 'NONE', 'NULL'];

    similarIds.forEach(userId => {
      expect(() => {
        validateUserId(userId);
      }).not.toThrow();
    });
  });
});
