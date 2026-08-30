export const COLORS = {
  primary: 'var(--color-primary)',
  primaryDark: '#E09E00',
  primaryLight: '#FFC84D',
  black: '#111111',
  white: '#FFFFFF',
  lightGray: '#F5F5F5',
  border: '#EAEAEA',
  success: 'var(--color-success)',
  warning: '#F59E0B',
  error: '#EF4444',
}

export const APP_NAME = 'UdrCrafts'

export const DUMMY_USER = {
  id: 'UDRC-2024-001',
  firstName: 'Rahul',
  lastName: 'Sharma',
  fullName: 'Rahul Sharma',
  email: 'rahul.sharma@example.com',
  phone: '+91 98765 43210',
  dateOfBirth: '1995-03-15',
  gender: 'Male',
  address: '42, Sector 14, MG Road',
  city: 'Gurugram',
  state: 'Haryana',
  district: 'Gurugram',
  pincode: '122001',
  currentAddress: '42, Sector 14, MG Road, Gurugram, Haryana',
  permanentAddress: '15, Village Road, Rewari, Haryana',
  emergencyContactName: 'Priya Sharma',
  emergencyContactNumber: '+91 98765 43211',
  dateJoined: '15 Jan 2024',
  partnerId: 'UDRC-2024-001',
  profileImage: '',
  vehicleType: 'Bike',
  vehicleNumber: 'HR-26-AB-1234',
  status: 'Verified' as const,
}

export const DASHBOARD_STATS = {
  totalDeliveries: 1248,
  currentEarnings: '₹45,280',
  completedOrders: 1198,
  customerRating: 4.8,
  todayDeliveries: 12,
}

export const RECENT_ACTIVITY = [
  { id: 1, action: 'Delivered order #UDC-4872 to Sector 14', time: '10 min ago', type: 'delivery' },
  { id: 2, action: 'Payment of ₹2,400 credited', time: '1 hour ago', type: 'payment' },
  { id: 3, action: 'New order #UDC-4891 assigned', time: '2 hours ago', type: 'order' },
  { id: 4, action: 'Documents verified successfully', time: '1 day ago', type: 'document' },
  { id: 5, action: 'Completed 5 deliveries in a row', time: '2 days ago', type: 'achievement' },
]

export const DOCUMENT_STATUS = {
  aadhaar: 'Verified' as const,
  pan: 'Verified' as const,
  drivingLicense: 'Verified' as const,
  bank: 'Pending' as const,
  vehicle: 'Verified' as const,
}

export const VEHICLE_TYPES = [
  { value: 'bike', label: 'Bike' },
  { value: 'scooter', label: 'Scooter' },
  { value: 'bicycle', label: 'Bicycle' },
  { value: 'electric', label: 'Electric Vehicle' },
  { value: 'car', label: 'Car' },
]
