const validator = require('validator');

const validateRegister = (req, res, next) => {
  const { name, lastName, email, password, mobile } = req.body;
  const errors = {};

  if (!name || name.trim().length < 2) {
    errors.name = 'First name must be at least 2 characters long';
  }

  if (!lastName || lastName.trim().length < 2) {
    errors.lastName = 'Last name must be at least 2 characters long';
  } else if (!/^[a-zA-Z\s'\-]+$/.test(lastName.trim())) {
    errors.lastName = 'Last name can only contain letters, spaces, hyphens, and apostrophes';
  }

  if (!email || !validator.isEmail(email)) {
    errors.email = 'Please provide a valid email address';
  }

  if (!password) {
    errors.password = 'Password is required';
  } else {
    if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters long';
    }
  }

  if (!mobile) {
    errors.mobile = 'Mobile number is required';
  } else if (!/^\+?[1-9]\d{1,14}$/.test(mobile.replace(/\s+/g, ''))) {
    errors.mobile = 'Please provide a valid mobile number (e.g. +91 9876543210)';
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

const validateLogin = (req, res, next) => {
  const { email, password } = req.body; // email field holds either email or lastName in requests
  const errors = {};

  if (!email || email.trim().length < 2) {
    errors.email = 'Email or last name is required (minimum 2 characters)';
  }

  if (!password) {
    errors.password = 'Password is required';
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

const validateBooking = (req, res, next) => {
  const { applicantDetails, bookingDate, bookingTime, paymentDetails } = req.body;
  const errors = {};

  // 1. Applicant details validation
  if (!applicantDetails) {
    errors.applicantDetails = 'Applicant details are required';
  } else {
    const list = Array.isArray(applicantDetails) ? applicantDetails : [applicantDetails];
    if (list.length === 0) {
      errors.applicantDetails = 'At least one applicant detail is required';
    } else {
      list.forEach((applicant, index) => {
        const prefix = Array.isArray(applicantDetails) ? `applicant_${index}_` : '';
        const { firstName, lastName, passportNumber, email, phone, dob, visaCategory, location, gender, nationality } = applicant;

        if (!firstName || firstName.trim().length < 2 || firstName.trim().length > 30 || !/^[A-Za-z\s'\-]+$/.test(firstName.trim())) {
          errors[`${prefix}firstName`] = 'First name must contain only letters, spaces, hyphens, or apostrophes and be 2 to 30 characters long';
        }

        if (!lastName || lastName.trim().length < 1 || lastName.trim().length > 30 || !/^[A-Za-z\s'\-]+$/.test(lastName.trim())) {
          errors[`${prefix}lastName`] = 'Last name must contain only letters, spaces, hyphens, or apostrophes and be 1 to 30 characters long';
        }

        if (!passportNumber || !/^[A-Z0-9]{8,9}$/.test(passportNumber.trim().toUpperCase())) {
          errors[`${prefix}passportNumber`] = 'Passport number must be 8 or 9 characters long and contain only letters and numbers';
        }

        if (!email || !validator.isEmail(email)) {
          errors[`${prefix}email`] = 'Please provide a valid email address';
        }

        if (!phone || !/^\+?[1-9]\d{1,14}$/.test(phone.replace(/\s+/g, ''))) {
          errors[`${prefix}phone`] = 'Please provide a valid phone number (e.g. +91 9876543210)';
        }

        if (!dob || isNaN(Date.parse(dob))) {
          errors[`${prefix}dob`] = 'Please provide a valid date of birth';
        } else {
          const birthDate = new Date(dob);
          if (birthDate > new Date()) {
            errors[`${prefix}dob`] = 'Date of birth cannot be in the future';
          }
        }

        if (!visaCategory) {
          errors[`${prefix}visaCategory`] = 'Visa category is required';
        }

        if (!location) {
          errors[`${prefix}location`] = 'Application location is required';
        }

        if (!gender) {
          errors[`${prefix}gender`] = 'Gender is required';
        }

        if (!nationality) {
          errors[`${prefix}nationality`] = 'Current nationality is required';
        }

        if (!applicant.passportDocument) {
          errors[`${prefix}passportDocument`] = 'Passport document is required';
        } else {
          const docStr = applicant.passportDocument;
          const matches = docStr.match(/^data:([^;]+);base64,(.+)$/);
          if (!matches) {
            errors[`${prefix}passportDocument`] = 'Invalid document format. Only JPG, JPEG, PNG, and PDF are allowed.';
          } else {
            const mimeType = matches[1].toLowerCase();
            const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
            if (!allowedMimeTypes.includes(mimeType)) {
              errors[`${prefix}passportDocument`] = 'Invalid file type. Only JPG, JPEG, PNG, and PDF are allowed.';
            }
            const sizeInBytes = Math.round((docStr.length * 3) / 4);
            if (sizeInBytes > 5 * 1024 * 1024) {
              errors[`${prefix}passportDocument`] = 'Passport document size must be less than 5 MB.';
            }
          }
        }
      });
    }
  }

  // 2. Date and time slot validation
  if (!bookingDate) {
    errors.bookingDate = 'Booking date is required';
  } else {
    const dateObj = new Date(bookingDate);
    if (isNaN(dateObj.getTime())) {
      errors.bookingDate = 'Please provide a valid booking date';
    }
    const day = dateObj.getDay();
    if (day === 0 || day === 6) {
      errors.bookingDate = 'Appointments are closed on weekends';
    }
  }

  if (!bookingTime) {
    errors.bookingTime = 'Booking time is required';
  }

  // 3. Payment Details validation
  if (!paymentDetails) {
    errors.paymentDetails = 'Payment details are required';
  } else {
    const { cardName, cardNumber, expiry, cvv } = paymentDetails;

    if (!cardName || cardName.trim().length < 2) {
      errors.cardName = 'Cardholder name is required';
    }

    if (!cardNumber || !/^\d{16}$/.test(cardNumber.replace(/\s+/g, ''))) {
      errors.cardNumber = 'Card number must be exactly 16 digits';
    }

    if (!expiry || !/^(0[1-9]|1[0-2])\/?([0-9]{2})$/.test(expiry.trim())) {
      errors.expiry = 'Expiry date must be in MM/YY format';
    }

    if (!cvv || !/^\d{3}$/.test(cvv.trim())) {
      errors.cvv = 'CVV must be exactly 3 digits';
    }
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

const validateAgentRegister = (req, res, next) => {
  const { agencyName, ownerName, email, mobile, gstNumber, address, city, state, country } = req.body;
  const errors = {};

  if (!agencyName || agencyName.trim().length < 2) {
    errors.agencyName = 'Agency name must be at least 2 characters long';
  }

  if (!ownerName || ownerName.trim().length < 2) {
    errors.ownerName = 'Owner name must be at least 2 characters long';
  }

  if (!email || !validator.isEmail(email)) {
    errors.email = 'Please provide a valid business email address';
  }

  if (!mobile) {
    errors.mobile = 'Mobile number is required';
  } else if (!/^\+?[1-9]\d{1,14}$/.test(mobile.replace(/\s+/g, ''))) {
    errors.mobile = 'Please provide a valid mobile number (e.g. +91 9876543210)';
  }

  if (!gstNumber || gstNumber.trim().length !== 15) {
    errors.gstNumber = 'GST Number is required and must be exactly 15 characters long';
  }

  if (!address || address.trim().length < 5) {
    errors.address = 'Office Address must be at least 5 characters long';
  }

  if (!city || city.trim().length < 2) {
    errors.city = 'City is required';
  }

  if (!state || state.trim().length < 2) {
    errors.state = 'State is required';
  }

  if (!country || country.trim().length < 2) {
    errors.country = 'Country is required';
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

module.exports = {
  validateRegister,
  validateLogin,
  validateBooking,
  validateAgentRegister
};
