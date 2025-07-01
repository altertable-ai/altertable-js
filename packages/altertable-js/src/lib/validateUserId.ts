import {
  RESERVED_USER_IDS,
  RESERVED_USER_IDS_CASE_SENSITIVE,
} from '../constants';

const reservedIdentifiersList = [
  ...RESERVED_USER_IDS,
  ...RESERVED_USER_IDS_CASE_SENSITIVE,
]
  .map(id => `- "${id}"`)
  .join('\n');
const reservedIdentifiersInfo = `List of reserved identifiers:\n${reservedIdentifiersList}`;

export function validateUserId(userId: string): void {
  if (!userId || userId.trim() === '') {
    throw new Error('User ID cannot be empty or contain only whitespace.');
  }

  const isCaseInsensitiveBlocked = RESERVED_USER_IDS.some(
    blockedId => userId.toLowerCase() === blockedId.toLowerCase()
  );

  if (isCaseInsensitiveBlocked) {
    throw new Error(
      `User ID "${userId}" is a reserved identifier and cannot be used.\n\n` +
        reservedIdentifiersInfo
    );
  }

  const isCaseSensitiveBlocked = RESERVED_USER_IDS_CASE_SENSITIVE.some(
    blockedId => userId === blockedId
  );

  if (isCaseSensitiveBlocked) {
    throw new Error(
      `User ID "${userId}" is a reserved identifier and cannot be used.\n\n` +
        reservedIdentifiersInfo
    );
  }
}
