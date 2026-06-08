const VOLUNTEER_APPROVAL_DEBUG = 'VOLUNTEER_APPROVAL_DEBUG';

/** Mongo filter: volunteer-capable accounts approved for volunteer features. */
const APPROVED_VOLUNTEER_FILTER = {
  role: { $in: ['VOLUNTEER', 'BOTH'] },
  volunteerApprovalStatus: 'approved'
};

function logPendingApplicantExcluded(context, detail) {
  console.log(VOLUNTEER_APPROVAL_DEBUG, 'pending applicant excluded', context, detail || '');
}

function logApprovedVolunteerIncluded(context, detail) {
  console.log(VOLUNTEER_APPROVAL_DEBUG, 'approved volunteer included', context, detail || '');
}

module.exports = {
  VOLUNTEER_APPROVAL_DEBUG,
  APPROVED_VOLUNTEER_FILTER,
  logPendingApplicantExcluded,
  logApprovedVolunteerIncluded
};
