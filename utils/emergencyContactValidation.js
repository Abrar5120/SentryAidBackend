/**
 * Shared emergency contact phone + completeness validation.
 */

function normalizePhoneNumber(raw) {
  if (raw == null) {
    return '';
  }
  return String(raw).trim();
}

/**
 * Basic phone format: 7–15 digits; allows leading +, spaces, dashes.
 * Preserves leading zeros by storing the normalized trimmed string, not parsing as number.
 */
function isValidPhoneNumber(phone) {
  const s = normalizePhoneNumber(phone);
  if (!s) {
    return false;
  }
  if (!/^[0-9+\-\s()]+$/.test(s)) {
    return false;
  }
  const digits = s.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

function resolveContactPhone(contact, linkedUserPhone) {
  const direct = normalizePhoneNumber(contact?.phoneNumber);
  if (direct && isValidPhoneNumber(direct)) {
    return direct;
  }
  const linked = normalizePhoneNumber(linkedUserPhone);
  if (linked && isValidPhoneNumber(linked)) {
    return linked;
  }
  return null;
}

function isCompleteEmergencyContact(contact) {
  if (!contact) {
    return false;
  }
  const name = contact.name != null ? String(contact.name).trim() : '';
  const email = contact.email != null ? String(contact.email).trim() : '';
  const relationship = contact.relationship != null ? String(contact.relationship).trim() : '';
  if (!name || !email || !relationship) {
    return false;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return false;
  }
  return isValidPhoneNumber(contact.phoneNumber);
}

module.exports = {
  normalizePhoneNumber,
  isValidPhoneNumber,
  resolveContactPhone,
  isCompleteEmergencyContact
};
