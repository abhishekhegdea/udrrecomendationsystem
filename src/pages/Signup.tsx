import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ProgressStepper, StepContainer } from '@/components/ui/progress-stepper'
import { UploadZone } from '@/components/ui/upload-zone'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { VEHICLE_TYPES } from '@/lib/constants'
import { Truck, ArrowLeft, ArrowRight, CheckCircle2, Edit3 } from 'lucide-react'

const steps = [
  { title: 'Basic Info', description: 'Personal details' },
  { title: 'Identity', description: 'Document verification' },
  { title: 'Vehicle', description: 'Transport details' },
  { title: 'Bank', description: 'Payment details' },
  { title: 'Review', description: 'Final review' },
]

const genderOptions = ['Male', 'Female', 'Other']

export function SignupPage() {
  const navigate = useNavigate()
  const { signup, isAuthenticated } = useAuth()
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Form data
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    gender: '',
    mobileNumber: '',
    email: '',
    currentAddress: '',
    permanentAddress: '',
    state: '',
    district: '',
    city: '',
    pincode: '',
    emergencyContactName: '',
    emergencyContactNumber: '',
    aadhaarNumber: '',
    aadhaarFront: null as File | null,
    aadhaarBack: null as File | null,
    panNumber: '',
    panCard: null as File | null,
    drivingLicenseNumber: '',
    drivingLicenseExpiry: '',
    drivingLicenseFront: null as File | null,
    drivingLicenseBack: null as File | null,
    vehicleType: '',
    vehicleRegistrationNumber: '',
    insuranceNumber: '',
    insuranceExpiry: '',
    rcUpload: null as File | null,
    insuranceUpload: null as File | null,
    helmetAvailable: '',
    accountHolderName: '',
    accountNumber: '',
    confirmAccountNumber: '',
    ifscCode: '',
    bankName: '',
    branch: '',
    upiId: '',
  })

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard')
  }, [isAuthenticated, navigate])

  // Auto-save progress
  useEffect(() => {
    const saved = localStorage.getItem('signupProgress')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setFormData((prev) => ({ ...prev, ...parsed }))
      } catch { /* ignore */ }
    }
  }, [])

  useEffect(() => {
    const { rcUpload, insuranceUpload, aadhaarFront, aadhaarBack, panCard, drivingLicenseFront, drivingLicenseBack, ...savable } = formData
    localStorage.setItem('signupProgress', JSON.stringify(savable))
  }, [formData])

  const updateField = useCallback((field: string, value: string | File | null) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => {
      if (prev[field]) {
        const { [field]: _, ...rest } = prev
        return rest
      }
      return prev
    })
  }, [])

  // Validators
  const validateStep1 = () => {
    const errs: Record<string, string> = {}
    if (!formData.firstName.trim()) errs.firstName = 'First name is required'
    if (!formData.lastName.trim()) errs.lastName = 'Last name is required'
    if (!formData.dateOfBirth) errs.dateOfBirth = 'Date of birth is required'
    if (!formData.gender) errs.gender = 'Gender is required'
    if (!formData.mobileNumber || formData.mobileNumber.length < 10) errs.mobileNumber = 'Valid mobile number required'
    if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errs.email = 'Valid email required'
    if (!formData.currentAddress.trim()) errs.currentAddress = 'Current address required'
    if (!formData.state.trim()) errs.state = 'State is required'
    if (!formData.district.trim()) errs.district = 'District is required'
    if (!formData.city.trim()) errs.city = 'City is required'
    if (!formData.pincode || formData.pincode.length < 6) errs.pincode = 'Valid pincode required'
    if (!formData.emergencyContactName.trim()) errs.emergencyContactName = 'Emergency contact required'
    if (!formData.emergencyContactNumber || formData.emergencyContactNumber.length < 10) errs.emergencyContactNumber = 'Valid emergency number required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const validateStep2 = () => {
    const errs: Record<string, string> = {}
    if (!formData.aadhaarNumber || formData.aadhaarNumber.length !== 12) errs.aadhaarNumber = 'Aadhaar must be 12 digits'
    if (!formData.panNumber || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(formData.panNumber.toUpperCase())) errs.panNumber = 'Invalid PAN format'
    if (!formData.drivingLicenseNumber.trim()) errs.drivingLicenseNumber = 'DL number required'
    if (!formData.drivingLicenseExpiry) errs.drivingLicenseExpiry = 'Expiry date required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const validateStep3 = () => {
    const errs: Record<string, string> = {}
    if (!formData.vehicleType) errs.vehicleType = 'Select vehicle type'
    if (!formData.vehicleRegistrationNumber.trim()) errs.vehicleRegistrationNumber = 'Registration number required'
    if (!formData.insuranceNumber.trim()) errs.insuranceNumber = 'Insurance number required'
    if (!formData.insuranceExpiry) errs.insuranceExpiry = 'Insurance expiry required'
    if (!formData.helmetAvailable) errs.helmetAvailable = 'Please select'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const validateStep4 = () => {
    const errs: Record<string, string> = {}
    if (!formData.accountHolderName.trim()) errs.accountHolderName = 'Account holder name required'
    if (!formData.accountNumber || formData.accountNumber.length < 9) errs.accountNumber = 'Valid account number required'
    if (formData.accountNumber !== formData.confirmAccountNumber) errs.confirmAccountNumber = 'Account numbers do not match'
    if (!formData.ifscCode || formData.ifscCode.length < 8) errs.ifscCode = 'Valid IFSC code required'
    if (!formData.bankName.trim()) errs.bankName = 'Bank name required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleNext = () => {
    let valid = false
    if (currentStep === 0) valid = validateStep1()
    else if (currentStep === 1) valid = validateStep2()
    else if (currentStep === 2) valid = validateStep3()
    else if (currentStep === 3) valid = validateStep4()
    else valid = true
    if (valid) setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1))
  }

  const handlePrevious = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0))
  }

  const handleSubmit = async () => {
    setLoading(true)
    try {
      await signup(formData)
      setSubmitted(true)
    } catch {
      setErrors({ submit: 'Something went wrong. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  const renderField = (field: string, label: string, props: Record<string, unknown> = {}) => (
    <Input
      label={label}
      value={(formData as any)[field] || ''}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField(field, e.target.value)}
      error={errors[field]}
      {...props}
    />
  )

  // Success state
  if (submitted) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-md"
        >
          <div className="w-24 h-24 mx-auto mb-8 rounded-full bg-green-50 flex items-center justify-center">
            <CheckCircle2 className="h-12 w-12 text-[#0C831F]" />
          </div>
          <h2 className="text-[28px] font-bold text-[#111111] mb-4">
            Application Submitted Successfully!
          </h2>
          <p className="text-gray-500 mb-2">
            Your documents are under verification.
          </p>
          <p className="text-sm text-gray-400 mb-10">
            Expected verification: 24-48 hours.
          </p>
          <Button
            size="md"
            variant="secondary"
            onClick={() => navigate('/login')}
          >
            Go to Login
          </Button>
        </motion.div>
      </div>
    )
  }

  return (
    <div 
      className="min-h-screen bg-cover bg-center bg-fixed relative"
      style={{ backgroundImage: 'url(/images/login-bg.jpg)' }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      
      {/* Header */}
      <div className="relative z-10 bg-white/10 backdrop-blur-md border-b border-white/20">
        <div className="max-w-3xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[12px] bg-[#F9B000] flex items-center justify-center shadow-lg">
              <Truck className="h-5 w-5 text-[#111111]" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight">UdrCrafts</h1>
              <p className="text-[10px] text-white/80 uppercase tracking-widest">Partner Registration</p>
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-10 lg:py-14">
        {/* Progress Stepper */}
        <div className="bg-white/20 backdrop-blur-2xl rounded-[20px] p-6 mb-8 shadow-xl border border-white/30">
          <ProgressStepper steps={steps} currentStep={currentStep} />
        </div>

        {/* Step Content */}
        <Card className="overflow-hidden bg-white/20 backdrop-blur-2xl border border-white/30 shadow-2xl rounded-[24px]">
          <CardContent className="p-8 lg:p-10">
            {/* Step 1: Basic Info */}
            <StepContainer isActive={currentStep === 0}>
              <div className="space-y-8">
                <div>
                  <h3 className="text-[28px] font-bold text-[#111111]">Basic Information</h3>
                  <p className="text-gray-500 mt-2">Tell us about yourself</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {renderField('firstName', 'First Name', { required: true })}
                  {renderField('lastName', 'Last Name', { required: true })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Date of Birth <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="date"
                      value={formData.dateOfBirth}
                      onChange={(e) => updateField('dateOfBirth', e.target.value)}
                      className="w-full rounded-[12px] border-2 border-[#EAEAEA] bg-white px-4 text-sm text-[#111111] focus:outline-none focus:border-[#F9B000] focus:ring-2 focus:ring-[#F9B000]/10 transition-all h-[52px]"
                    />
                    {errors.dateOfBirth && (
                      <p className="text-xs text-[#EF4444]">{errors.dateOfBirth}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Gender <span className="text-red-400">*</span>
                    </label>
                    <div className="flex gap-3 h-[52px]">
                      {genderOptions.map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => updateField('gender', g)}
                          className={`flex-1 rounded-[12px] text-sm font-semibold border-2 transition-all ${
                            formData.gender === g
                              ? 'border-[#F9B000] bg-[#F9B000]/5 text-[#111111]'
                              : 'border-[#EAEAEA] text-gray-500 hover:border-gray-300'
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                    {errors.gender && (
                      <p className="text-xs text-[#EF4444]">{errors.gender}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {renderField('mobileNumber', 'Mobile Number', { type: 'tel', placeholder: '10-digit mobile number', required: true })}
                  {renderField('email', 'Email', { type: 'email', placeholder: 'your@email.com', required: true })}
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Current Address <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    value={formData.currentAddress}
                    onChange={(e) => updateField('currentAddress', e.target.value)}
                    rows={3}
                    className="w-full rounded-[12px] border-2 border-[#EAEAEA] bg-white px-4 py-3 text-sm text-[#111111] focus:outline-none focus:border-[#F9B000] focus:ring-2 focus:ring-[#F9B000]/10 transition-all resize-none"
                  />
                  {errors.currentAddress && (
                    <p className="text-xs text-[#EF4444]">{errors.currentAddress}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Permanent Address
                  </label>
                  <textarea
                    value={formData.permanentAddress}
                    onChange={(e) => updateField('permanentAddress', e.target.value)}
                    rows={3}
                    className="w-full rounded-[12px] border-2 border-[#EAEAEA] bg-white px-4 py-3 text-sm text-[#111111] focus:outline-none focus:border-[#F9B000] focus:ring-2 focus:ring-[#F9B000]/10 transition-all resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  {renderField('state', 'State', { required: true })}
                  {renderField('district', 'District', { required: true })}
                  {renderField('city', 'City', { required: true })}
                </div>

                {renderField('pincode', 'Pincode', { type: 'tel', placeholder: '6-digit pincode', required: true })}

                <div className="border-t border-[#EAEAEA] pt-8">
                  <h4 className="text-base font-semibold text-[#111111] mb-5">Emergency Contact</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {renderField('emergencyContactName', 'Emergency Contact Name', { required: true })}
                    {renderField('emergencyContactNumber', 'Emergency Contact Number', { type: 'tel', required: true })}
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <Button variant="outline" onClick={() => navigate('/login')} className="flex-1">
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button>
                  <Button onClick={handleNext} className="flex-1">
                    Next <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </StepContainer>

            {/* Step 2: Identity */}
            <StepContainer isActive={currentStep === 1}>
              <div className="space-y-8">
                <div>
                  <h3 className="text-[28px] font-bold text-[#111111]">Identity Verification</h3>
                  <p className="text-gray-500 mt-2">Upload your documents for verification</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {renderField('aadhaarNumber', 'Aadhaar Number', { type: 'tel', placeholder: '12-digit Aadhaar number', required: true, maxLength: 12 })}
                  {renderField('panNumber', 'PAN Number', { placeholder: 'e.g. ABCDE1234F', required: true })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <UploadZone label="Upload Aadhaar Front" onUpload={(files) => updateField('aadhaarFront', files[0])} />
                  <UploadZone label="Upload Aadhaar Back" onUpload={(files) => updateField('aadhaarBack', files[0])} />
                </div>

                <UploadZone label="Upload PAN Card" onUpload={(files) => updateField('panCard', files[0])} />

                <div className="border-t border-[#EAEAEA] pt-8">
                  <h4 className="text-base font-semibold text-[#111111] mb-5">Driving License</h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                    {renderField('drivingLicenseNumber', 'Driving License Number', { required: true })}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        DL Expiry Date <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="date"
                        value={formData.drivingLicenseExpiry}
                        onChange={(e) => updateField('drivingLicenseExpiry', e.target.value)}
                        className="w-full rounded-[12px] border-2 border-[#EAEAEA] bg-white px-4 text-sm text-[#111111] focus:outline-none focus:border-[#F9B000] focus:ring-2 focus:ring-[#F9B000]/10 transition-all h-[52px]"
                      />
                      {errors.drivingLicenseExpiry && (
                        <p className="text-xs text-[#EF4444]">{errors.drivingLicenseExpiry}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <UploadZone label="Upload Driving License Front" onUpload={(files) => updateField('drivingLicenseFront', files[0])} />
                    <UploadZone label="Upload Driving License Back" onUpload={(files) => updateField('drivingLicenseBack', files[0])} />
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <Button variant="outline" onClick={handlePrevious} className="flex-1">
                    <ArrowLeft className="h-4 w-4" /> Previous
                  </Button>
                  <Button onClick={handleNext} className="flex-1">
                    Save & Continue <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </StepContainer>

            {/* Step 3: Vehicle */}
            <StepContainer isActive={currentStep === 2}>
              <div className="space-y-8">
                <div>
                  <h3 className="text-[28px] font-bold text-[#111111]">Vehicle Details</h3>
                  <p className="text-gray-500 mt-2">Tell us about your delivery vehicle</p>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Vehicle Type <span className="text-red-400">*</span>
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {VEHICLE_TYPES.map((v) => (
                      <button
                        key={v.value}
                        type="button"
                        onClick={() => updateField('vehicleType', v.value)}
                        className={`py-4 px-4 rounded-[12px] text-sm font-semibold border-2 transition-all ${
                          formData.vehicleType === v.value
                            ? 'border-[#F9B000] bg-[#F9B000]/5 text-[#111111]'
                            : 'border-[#EAEAEA] text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                  {errors.vehicleType && (
                    <p className="text-xs text-[#EF4444]">{errors.vehicleType}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {renderField('vehicleRegistrationNumber', 'Vehicle Registration Number', {
                    placeholder: 'e.g. HR-26-AB-1234',
                    required: true,
                  })}
                  {renderField('insuranceNumber', 'Insurance Number', { required: true })}
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Insurance Expiry <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.insuranceExpiry}
                    onChange={(e) => updateField('insuranceExpiry', e.target.value)}
                    className="w-full rounded-[12px] border-2 border-[#EAEAEA] bg-white px-4 text-sm text-[#111111] focus:outline-none focus:border-[#F9B000] focus:ring-2 focus:ring-[#F9B000]/10 transition-all h-[52px]"
                  />
                  {errors.insuranceExpiry && (
                    <p className="text-xs text-[#EF4444]">{errors.insuranceExpiry}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <UploadZone label="Upload RC" onUpload={(files) => updateField('rcUpload', files[0])} />
                  <UploadZone label="Upload Insurance" onUpload={(files) => updateField('insuranceUpload', files[0])} />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Helmet Available? <span className="text-red-400">*</span>
                  </label>
                  <div className="flex gap-3 h-[52px]">
                    {['Yes', 'No'].map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => updateField('helmetAvailable', opt)}
                        className={`flex-1 rounded-[12px] text-sm font-semibold border-2 transition-all ${
                          formData.helmetAvailable === opt
                            ? 'border-[#F9B000] bg-[#F9B000]/5 text-[#111111]'
                            : 'border-[#EAEAEA] text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                  {errors.helmetAvailable && (
                    <p className="text-xs text-[#EF4444]">{errors.helmetAvailable}</p>
                  )}
                </div>

                <div className="flex gap-4 pt-4">
                  <Button variant="outline" onClick={handlePrevious} className="flex-1">
                    <ArrowLeft className="h-4 w-4" /> Previous
                  </Button>
                  <Button onClick={handleNext} className="flex-1">
                    Next <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </StepContainer>

            {/* Step 4: Bank */}
            <StepContainer isActive={currentStep === 3}>
              <div className="space-y-8">
                <div>
                  <h3 className="text-[28px] font-bold text-[#111111]">Bank Details</h3>
                  <p className="text-gray-500 mt-2">Add your payment information</p>
                </div>

                {renderField('accountHolderName', 'Account Holder Name', { required: true })}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {renderField('accountNumber', 'Account Number', { type: 'tel', required: true })}
                  {renderField('confirmAccountNumber', 'Confirm Account Number', { type: 'tel', required: true })}
                </div>

                {renderField('ifscCode', 'IFSC Code', { placeholder: 'e.g. SBIN0001234', required: true })}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {renderField('bankName', 'Bank Name', { required: true })}
                  {renderField('branch', 'Branch')}
                </div>

                {renderField('upiId', 'UPI ID', { placeholder: 'yourname@upi' })}

                <div className="flex gap-4 pt-4">
                  <Button variant="outline" onClick={handlePrevious} className="flex-1">
                    <ArrowLeft className="h-4 w-4" /> Previous
                  </Button>
                  <Button onClick={handleNext} className="flex-1">
                    Next <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </StepContainer>

            {/* Step 5: Review */}
            <StepContainer isActive={currentStep === 4}>
              <div className="space-y-8">
                <div>
                  <h3 className="text-[28px] font-bold text-[#111111]">Review & Submit</h3>
                  <p className="text-gray-500 mt-2">
                    Please verify all details before submitting
                  </p>
                </div>

                {/* Basic Info Review */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-semibold text-[#111111]">
                      Basic Information
                    </h4>
                    <button
                      onClick={() => setCurrentStep(0)}
                      className="text-xs text-[#F9B000] hover:underline flex items-center gap-1 font-semibold"
                    >
                      <Edit3 className="h-3 w-3" /> Edit
                    </button>
                  </div>
                  <div className="bg-gray-50 rounded-[14px] p-5 space-y-3">
                    <ReviewRow label="Full Name" value={`${formData.firstName} ${formData.lastName}`} />
                    <ReviewRow label="Date of Birth" value={formData.dateOfBirth} />
                    <ReviewRow label="Gender" value={formData.gender} />
                    <ReviewRow label="Mobile" value={formData.mobileNumber} />
                    <ReviewRow label="Email" value={formData.email} />
                    <ReviewRow label="Address" value={formData.currentAddress} />
                    <ReviewRow label="City/District" value={`${formData.city}, ${formData.district}`} />
                    <ReviewRow label="State" value={formData.state} />
                    <ReviewRow label="Pincode" value={formData.pincode} />
                    <ReviewRow label="Emergency Contact" value={`${formData.emergencyContactName} - ${formData.emergencyContactNumber}`} />
                  </div>
                </div>

                {/* Identity Review */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-semibold text-[#111111]">
                      Identity Verification
                    </h4>
                    <button
                      onClick={() => setCurrentStep(1)}
                      className="text-xs text-[#F9B000] hover:underline flex items-center gap-1 font-semibold"
                    >
                      <Edit3 className="h-3 w-3" /> Edit
                    </button>
                  </div>
                  <div className="bg-gray-50 rounded-[14px] p-5 space-y-3">
                    <ReviewRow label="Aadhaar" value={formData.aadhaarNumber.replace(/\d(?=\d{4})/g, 'X')} />
                    <ReviewRow label="PAN" value={formData.panNumber} />
                    <ReviewRow label="Driving License" value={formData.drivingLicenseNumber} />
                    <ReviewRow label="DL Expiry" value={formData.drivingLicenseExpiry} />
                  </div>
                </div>

                {/* Vehicle Review */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-semibold text-[#111111]">
                      Vehicle Details
                    </h4>
                    <button
                      onClick={() => setCurrentStep(2)}
                      className="text-xs text-[#F9B000] hover:underline flex items-center gap-1 font-semibold"
                    >
                      <Edit3 className="h-3 w-3" /> Edit
                    </button>
                  </div>
                  <div className="bg-gray-50 rounded-[14px] p-5 space-y-3">
                    <ReviewRow
                      label="Vehicle Type"
                      value={VEHICLE_TYPES.find((v) => v.value === formData.vehicleType)?.label || formData.vehicleType}
                    />
                    <ReviewRow label="Registration" value={formData.vehicleRegistrationNumber} />
                    <ReviewRow label="Insurance" value={formData.insuranceNumber} />
                    <ReviewRow label="Helmet" value={formData.helmetAvailable} />
                  </div>
                </div>

                {/* Bank Review */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-semibold text-[#111111]">
                      Bank Details
                    </h4>
                    <button
                      onClick={() => setCurrentStep(3)}
                      className="text-xs text-[#F9B000] hover:underline flex items-center gap-1 font-semibold"
                    >
                      <Edit3 className="h-3 w-3" /> Edit
                    </button>
                  </div>
                  <div className="bg-gray-50 rounded-[14px] p-5 space-y-3">
                    <ReviewRow label="Account Holder" value={formData.accountHolderName} />
                    <ReviewRow
                      label="Account Number"
                      value={`XXXX${formData.accountNumber.slice(-4)}`}
                    />
                    <ReviewRow label="IFSC" value={formData.ifscCode} />
                    <ReviewRow label="Bank" value={formData.bankName} />
                    <ReviewRow label="UPI" value={formData.upiId || 'Not provided'} />
                  </div>
                </div>

                {errors.submit && (
                  <p className="text-sm text-[#EF4444] bg-red-50 p-4 rounded-[12px]">
                    {errors.submit}
                  </p>
                )}

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1 w-5 h-5 rounded border-gray-300 text-[#F9B000] focus:ring-[#F9B000]"
                  />
                  <span className="text-sm text-gray-600 leading-relaxed">
                    I certify that all the details provided above are correct and true
                    to the best of my knowledge.
                  </span>
                </label>

                <div className="flex gap-4 pt-4">
                  <Button variant="outline" onClick={handlePrevious} className="flex-1">
                    <ArrowLeft className="h-4 w-4" /> Previous
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={handleSubmit}
                    loading={loading}
                    className="flex-1"
                  >
                    Submit Application
                  </Button>
                </div>
              </div>
            </StepContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-semibold text-[#111111]">{value}</span>
    </div>
  )
}
