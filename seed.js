const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Agent = require('./models/Agent');
const Center = require('./models/Center');
const Slot = require('./models/Slot');
const Appointment = require('./models/Appointment');
const Payment = require('./models/Payment');
const Subscription = require('./models/Subscription');
const Invoice = require('./models/Invoice');

dotenv.config();

const DEFAULT_SLOTS = [
  { startTime: '09:00', endTime: '09:30' },
  { startTime: '09:30', endTime: '10:00' },
  { startTime: '10:00', endTime: '10:30' },
  { startTime: '10:30', endTime: '11:00' },
  { startTime: '11:00', endTime: '11:30' },
  { startTime: '11:30', endTime: '12:00' },
  { startTime: '12:00', endTime: '12:30' },
  { startTime: '12:30', endTime: '13:00' },
  { startTime: '13:00', endTime: '13:30' },
  { startTime: '13:30', endTime: '14:00' },
  { startTime: '14:00', endTime: '14:30' },
  { startTime: '14:30', endTime: '15:00' },
  { startTime: '15:00', endTime: '15:30' },
  { startTime: '15:30', endTime: '16:00' }
];

const seedData = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vfs_global');
    console.log('MongoDB Connected for Seeding...');

    console.log('Clearing old User collections and seeding Agent profiles...');
    
    // We can clear existing collections
    await Agent.deleteMany({});
    await Subscription.deleteMany({});
    await Invoice.deleteMany({});
    await Appointment.deleteMany({});
    await Payment.deleteMany({});
    
    // 1. Seed Agents
    const seedAgents = [
      {
        clerkId: 'clerk-admin-123',
        agencyName: 'Dream Catcher Immigrations',
        ownerName: 'System Administrator',
        email: (process.env.ADMIN_EMAIL || 'admindci@gmail.com').toLowerCase().trim(),
        password: process.env.ADMIN_PASSWORD || 'Admin@2605',
        mobile: '9876543210',
        gstNumber: 'N/A',
        address: 'Shivaji Stadium Metro Station, Connaught Place',
        city: 'New Delhi',
        state: 'Delhi',
        country: 'India',
        role: 'SUPER_ADMIN',
        status: 'Active'
      },
      {
        clerkId: 'clerk-agent-john',
        agencyName: 'John Doe Travels & Visa Services',
        ownerName: 'John Doe',
        email: 'john@gmail.com',
        password: 'password123',
        mobile: '9876543213',
        gstNumber: '27AAAAA1111A1Z1',
        address: '456 Travel Complex, Nariman Point',
        city: 'Mumbai',
        state: 'Maharashtra',
        country: 'India',
        role: 'Agent',
        status: 'Active' // Approved & Subscribed agent
      },
      {
        clerkId: 'clerk-agent-pending',
        agencyName: 'Stellar Visas & Immigration',
        ownerName: 'Alice Smith',
        email: 'alice@gmail.com',
        password: 'password123',
        mobile: '9876543214',
        gstNumber: '27BBBBB2222B2Z2',
        address: '789 Business Center, Egmore',
        city: 'Chennai',
        state: 'Tamil Nadu',
        country: 'India',
        role: 'Agent',
        status: 'Pending' // Pending verification
      },
      {
        clerkId: 'clerk-agent-expired',
        agencyName: 'Vintage Globetrotters',
        ownerName: 'Bob Vance',
        email: 'bob@gmail.com',
        password: 'password123',
        mobile: '9876543215',
        gstNumber: '27CCCCC3333C3Z3',
        address: '101 Indiranagar, Double Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        country: 'India',
        role: 'Agent',
        status: 'Subscription Expired' // Approved but expired subscription
      }
    ];

    let createdAgents = [];
    for (const a of seedAgents) {
      const agent = new Agent(a);
      await agent.save();
      createdAgents.push(agent);
    }
    console.log('Agent profiles seeded successfully!');

    const johnAgent = createdAgents.find(a => a.email === 'john@gmail.com');
    const expiredAgent = createdAgents.find(a => a.email === 'bob@gmail.com');

    // 2. Seed active subscription for John Doe
    const startDate = new Date();
    const expiryDate = new Date();
    expiryDate.setDate(startDate.getDate() + 30);
    const invoiceNumber = `INV-${Date.now()}-1001`;

    const subJohn = await Subscription.create({
      agentId: johnAgent._id,
      planName: 'Professional Agent Plan',
      planAmount: 0.85,
      gstAmount: 0.15,
      totalAmount: 1,
      invoiceNumber,
      paymentStatus: 'Paid',
      subscriptionStatus: 'Active',
      paymentDate: startDate,
      startDate,
      expiryDate,
      renewalDate: expiryDate,
      createdBy: johnAgent._id
    });

    const paymentJohn = await Payment.create({
      appointmentId: new mongoose.Types.ObjectId(), // Dummy ID
      amount: 1,
      transactionId: 'TXN-UPI-SEED-JOHN',
      status: 'SUCCESS'
    });

    const pdfService = require('./services/pdfService');
    try {
      const pdfBuffer = await pdfService.generateGSTInvoicePDF(johnAgent, subJohn, paymentJohn);
      await Invoice.create({
        invoiceNumber,
        agentId: johnAgent._id,
        subscriptionId: subJohn._id,
        pdfData: pdfBuffer.toString('base64')
      });
      console.log('Seeded John Doe GST Invoice PDF.');
    } catch (pdfErr) {
      console.error('Invoice seeding failed:', pdfErr.message);
    }

    // Seed expired subscription for Bob
    const pastStartDate = new Date();
    pastStartDate.setDate(pastStartDate.getDate() - 35);
    const pastExpiryDate = new Date();
    pastExpiryDate.setDate(pastExpiryDate.getDate() - 5);
    const invoiceNumberBob = `INV-${Date.now()}-1002`;

    await Subscription.create({
      agentId: expiredAgent._id,
      planName: 'Professional Agent Plan',
      planAmount: 0.85,
      gstAmount: 0.15,
      totalAmount: 1,
      invoiceNumber: invoiceNumberBob,
      paymentStatus: 'Paid',
      subscriptionStatus: 'Expired',
      paymentDate: pastStartDate,
      startDate: pastStartDate,
      expiryDate: pastExpiryDate,
      renewalDate: pastExpiryDate,
      createdBy: expiredAgent._id
    });

    // 3. Seed Centers from Master Data
    const { GOING_TO_COUNTRIES, CENTRES_CONFIG } = require('./config/masterData');
    
    const resolveCityDetails = (city) => {
      const c = city.toLowerCase();
      if (c === 'chennai') {
        return { timezone: 'IST', address: 'Fagun Towers, Third Floor, No. 74, Ethiraj Salai, Egmore, Chennai - 600008, India' };
      } else if (c === 'mumbai') {
        return { timezone: 'IST', address: 'Trade Centre, G-Block, Ground Floor, Bandra Kurla Complex, Bandra (East), Mumbai - 400051, India' };
      } else if (c === 'new delhi' || c === 'delhi') {
        return { timezone: 'IST', address: 'Shivaji Stadium Metro Station, Concourse Level, Baba Kharak Singh Marg, Connaught Place, New Delhi - 110001, India' };
      } else if (c === 'london') {
        return { timezone: 'GMT', address: '66 Wilson Street, London EC2A 2BT, United Kingdom' };
      } else if (c === 'hyderabad') {
        return { timezone: 'IST', address: '8-2-248/1/7/25, Ground Floor, Road No 3, Banjara Hills, Hyderabad - 500034, India' };
      } else if (c === 'bengaluru' || c === 'bangalore') {
        return { timezone: 'IST', address: 'Global Tech Park, Ground Floor, Tower C, No 11, O\'Shaughnessy Road, Langford Town, Bengaluru - 560025, India' };
      }
      return { timezone: 'UTC', address: `${city} Visa Application Centre Address` };
    };

    const centersData = [];
    const countryMap = {};
    GOING_TO_COUNTRIES.forEach(country => {
      countryMap[country.code] = country;
    });

    for (const letter in CENTRES_CONFIG) {
      for (const centerConfig of CENTRES_CONFIG[letter]) {
        const country = countryMap[centerConfig.code];
        if (!country) continue;
        
        for (const city of centerConfig.cities) {
          const details = resolveCityDetails(city);
          const nameSuffix = centerConfig.suffix || '';
          const centerName = `${country.name} Visa Application Centre, ${city}${nameSuffix}`;
          
          centersData.push({
            name: centerName,
            city: city,
            timezone: details.timezone,
            address: details.address,
            active: true,
            countryName: country.name,
            countryCode: country.code,
            countryFlag: country.flag
          });
        }
      }
    }

    let seededCenters = await Center.find();
    if (seededCenters.length === 0) {
      seededCenters = await Center.insertMany(centersData);
      console.log(`Seeded ${seededCenters.length} visa centers from Master Data.`);
    } else {
      console.log(`Centers already exist (${seededCenters.length}). Skipping center seeding.`);
    }

    // 4. Seed Slots for the next 10 Weekdays for CA, GB, and US Centers
    let slotCount = 0;
    const existingSlots = await Slot.countDocuments();
    if (existingSlots === 0) {
      const today = new Date();
      const centersToSeedSlots = seededCenters.filter(c => ['CA', 'GB', 'US'].includes(c.countryCode));

      for (let i = 1; i <= 10; i++) {
        const currentDate = new Date();
        currentDate.setDate(today.getDate() + i);

        // Skip weekends
        const dayOfWeek = currentDate.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;

        const dateStr = currentDate.toISOString().split('T')[0];

        for (const center of centersToSeedSlots) {
          for (const s of DEFAULT_SLOTS) {
            await Slot.create({
              centerId: center._id,
              date: dateStr,
              startTime: s.startTime,
              endTime: s.endTime,
              capacity: 5,
              bookedCount: 0,
              lockedCount: 0,
              availableCount: 5,
              status: 'AVAILABLE'
            });
            slotCount++;
          }
        }
      }
      console.log(`Seeded ${slotCount} active slots across centers.`);
    } else {
      console.log(`Slots already exist (${existingSlots}). Skipping slot seeding.`);
    }

    // 5. Seed a couple of default appointments for testing
    const firstCenter = seededCenters.find(c => ['CA', 'GB', 'US'].includes(c.countryCode)) || seededCenters[0];
    const testSlot1 = await Slot.findOne({ centerId: firstCenter._id, startTime: '09:00' });
    const testSlot2 = await Slot.findOne({ centerId: firstCenter._id, startTime: '09:30' });

    await Appointment.deleteMany({}); // Clear old test bookings

    if (testSlot1 && testSlot2) {
      // Seed a Paid Booking for John Doe
      const appt1 = await Appointment.create({
        referenceNumber: 'VFS-GBR-112233',
        userId: johnAgent._id,
        agencyName: johnAgent.agencyName,
        agentEmail: johnAgent.email,
        agentPhone: johnAgent.mobile,
        bookedBy: johnAgent.ownerName,
        supportingDocuments: [],
        internalNotes: 'Client traveling for tourist purposes.',
        centerId: firstCenter._id,
        slotId: testSlot1._id,
        applicantDetails: [{
          firstName: 'Robert',
          lastName: 'Smith',
          passportNumber: 'A1234567',
          email: 'robert@gmail.com',
          phone: '9876543210',
          dob: new Date('1990-05-15'),
          visaCategory: 'Standard Tourist',
          location: firstCenter.name,
          gender: 'Male',
          nationality: 'Indian',
          passportDocument: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErShift'
        }],
        servicesSelected: [{ name: 'Premium Lounge Service', price: 3250 }],
        bookingDate: new Date(testSlot1.date),
        bookingTime: testSlot1.startTime,
        totalAmount: 3250,
        status: 'BOOKED',
        paymentStatus: 'Paid'
      });
      testSlot1.bookedCount = 1;
      await testSlot1.save();

      // Seed a Pending Verification Booking for John Doe
      const appt2 = await Appointment.create({
        referenceNumber: 'VFS-GBR-445566',
        userId: johnAgent._id,
        agencyName: johnAgent.agencyName,
        agentEmail: johnAgent.email,
        agentPhone: johnAgent.mobile,
        bookedBy: johnAgent.ownerName,
        supportingDocuments: [],
        internalNotes: 'Urgent business visa application.',
        centerId: firstCenter._id,
        slotId: testSlot2._id,
        applicantDetails: [{
          firstName: 'Alice',
          lastName: 'Green',
          passportNumber: 'B9876543',
          email: 'alice.green@gmail.com',
          phone: '9812345678',
          dob: new Date('1995-10-20'),
          visaCategory: 'Standard Tourist',
          location: firstCenter.name,
          gender: 'Female',
          nationality: 'Indian',
          passportDocument: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErShift'
        }],
        servicesSelected: [{ name: 'Document Scanning Assistance', price: 950 }],
        bookingDate: new Date(testSlot2.date),
        bookingTime: testSlot2.startTime,
        totalAmount: 950,
        status: 'Pending Verification',
        paymentStatus: 'Pending Verification'
      });
      testSlot2.lockedCount = 1;
      await testSlot2.save();

      await Payment.create({
        appointmentId: appt2._id,
        amount: 950,
        transactionId: 'TXN-UPI-123456',
        screenshot: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErShift',
        gatewayResponse: { manualVerification: true },
        status: 'PENDING_VERIFICATION'
      });
      console.log('Seeded John Doe test client bookings.');
    }

    console.log('Seeding process finished successfully!');
    process.exit(0);

  } catch (error) {
    console.error(`Error during seeding: ${error.message}`);
    process.exit(1);
  }
};

seedData();
