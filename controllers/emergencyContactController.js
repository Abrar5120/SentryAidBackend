const EmergencyContact = require('../models/EmergencyContact');
const User = require('../models/User');
const {
  normalizePhoneNumber,
  isValidPhoneNumber,
  isCompleteEmergencyContact
} = require('../utils/emergencyContactValidation');

const EMERGENCY_CONTACT_DEBUG = 'EMERGENCY_CONTACT_DEBUG';

const ALLOWED_RELATIONSHIPS = [
  'Mother',
  'Father',
  'Brother',
  'Sister',
  'Friend',
  'Partner',
  'Guardian',
  'Relative',
  'Emergency Contact'
];

function normalizeRelationship(raw) {
  const s = (raw == null ? '' : String(raw)).trim();
  if (ALLOWED_RELATIONSHIPS.includes(s)) {
    return s;
  }
  return 'Emergency Contact';
}

const addEmergencyContact = async (req, res) => {
  try {
    const ownerId = req?.user?._id;
    const { name, email, relationship, phoneNumber } = req.body || {};

    if (!ownerId) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }
    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'name and email are required' });
    }

    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    if (!normalizedPhone) {
      return res.status(400).json({ success: false, message: 'phoneNumber is required' });
    }
    if (!isValidPhoneNumber(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid phone number'
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const linked = await User.findOne({ email: normalizedEmail }).select('_id');
    const relationshipLabel = normalizeRelationship(relationship);

    const doc = await EmergencyContact.create({
      userId: ownerId,
      name: String(name).trim(),
      email: normalizedEmail,
      phoneNumber: normalizedPhone,
      isRegistered: !!linked,
      linkedUserId: linked ? linked._id : null,
      relationship: relationshipLabel
    });

    console.log(EMERGENCY_CONTACT_DEBUG, 'contacts saved', doc._id.toString(), 'registered=', doc.isRegistered);
    console.log(EMERGENCY_CONTACT_DEBUG, 'phone saved', normalizedPhone);

    return res.status(201).json({
      success: true,
      contact: doc
    });
  } catch (error) {
    console.error('addEmergencyContact error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add emergency contact'
    });
  }
};

const getMyEmergencyContacts = async (req, res) => {
  try {
    const ownerId = req?.user?._id;
    if (!ownerId) {
      return res.status(401).json({ success: false, contacts: [] });
    }

    const contacts = await EmergencyContact.find({ userId: ownerId }).sort({ createdAt: -1 });

    console.log(EMERGENCY_CONTACT_DEBUG, 'contacts loaded', contacts.length);

    return res.json({
      success: true,
      contacts
    });
  } catch (error) {
    console.error('getMyEmergencyContacts error:', error);
    return res.status(500).json({
      success: false,
      contacts: []
    });
  }
};

const deleteEmergencyContact = async (req, res) => {
  try {
    const ownerId = req?.user?._id;
    const { id } = req.params;

    if (!ownerId) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }
    if (!id) {
      return res.status(400).json({ success: false, message: 'id is required' });
    }

    const deleted = await EmergencyContact.findOneAndDelete({
      _id: id,
      userId: ownerId
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    console.log(EMERGENCY_CONTACT_DEBUG, 'contacts deleted', id);

    return res.json({
      success: true,
      message: 'Contact deleted'
    });
  } catch (error) {
    console.error('deleteEmergencyContact error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete emergency contact'
    });
  }
};

module.exports = {
  addEmergencyContact,
  getMyEmergencyContacts,
  deleteEmergencyContact,
  isCompleteEmergencyContact
};
