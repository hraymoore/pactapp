const { getPreferences } = require("./notification-prefs");

// The one place a `users` row becomes "what the client is allowed to see
// about its own account" — used both by routes/auth.js (signup/login/
// profile responses) and middleware/auth.js (req.user, and so GET /api/
// auth/me) so there's exactly one shape, not two drifting in parallel.
// That drift already happened once: attachUser used to hand-roll its own
// narrower object and silently never gained any field added here since.
function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    tier: row.tier,
    tierExpiresAt: row.tier_expires_at,
    accountType: row.account_type,
    legalFirstName: row.legal_first_name,
    legalLastName: row.legal_last_name,
    dateOfBirth: row.date_of_birth,
    created_at: row.created_at,
    passwordIsTemporary: !!row.temp_password_expires_at,
    mfaEnabled: !!row.mfa_enabled,
    jobTitle: row.job_title,
    company: row.company,
    bio: row.bio,
    website: row.website,
    timezone: row.timezone,
    preferredLanguage: row.preferred_language,
    dateFormat: row.date_format,
    photoFileRef: row.photo_file_ref,
    pendingEmail: row.pending_email,
    recoveryEmail: row.recovery_email,
    recoveryEmailVerified: !!row.recovery_email_verified_at,
    pendingRecoveryEmail: row.pending_recovery_email,
    phone: row.phone,
    phoneVerified: !!row.phone_verified_at,
    pendingPhone: row.pending_phone,
    privacyShowPhoto: !!row.privacy_show_photo,
    privacyShowJobTitle: !!row.privacy_show_job_title,
    notificationPreferences: getPreferences(row),
  };
}

module.exports = { publicUser };
