import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Section } from '@/types/domain.types';
import { StudentProfileInput, isValidPHPhone, isValidLRN } from '@/lib/validation';
import { registerStudentWithProfile } from '../api';
import {
  User,
  MapPin,
  Heart,
  GraduationCap,
  Users,
  Building,
  Plus,
  Trash2,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface StudentProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  sections: Section[];
  onSuccess: () => void;
}

type TabType = 'identity' | 'address' | 'personal' | 'school' | 'guardians' | 'enrollment';

interface GuardianRow {
  id?: string;
  full_name: string;
  relationship: string;
  mobile_number: string;
  email: string;
  address: string;
  is_primary: boolean;
}

export const StudentProfileModal: React.FC<StudentProfileModalProps> = ({
  isOpen,
  onClose,
  sections,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('identity');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Identity Form State
  const [lrn, setLrn] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [suffix, setSuffix] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [sex, setSex] = useState<'Male' | 'Female' | 'Other'>('Male');

  // Address Form State
  const [houseStreet, setHouseStreet] = useState('');
  const [barangay, setBarangay] = useState('San Roque');
  const [cityMunicipality, setCityMunicipality] = useState('Antipolo');
  const [province, setProvince] = useState('Rizal');
  const [zipCode, setZipCode] = useState('1870');

  // Personal Info Form State
  const [religion, setReligion] = useState('');
  const [motherTongue, setMotherTongue] = useState('Tagalog');
  const [ethnicGroup, setEthnicGroup] = useState('');
  const [isPwd, setIsPwd] = useState(false);
  const [is4ps, setIs4ps] = useState(false);

  // Previous School Form State
  const [prevSchoolName, setPrevSchoolName] = useState('');
  const [prevGradeLevel, setPrevGradeLevel] = useState<number | ''>('');
  const [prevGeneralAverage, setPrevGeneralAverage] = useState<number | ''>('');
  const [schoolYearAdmitted, setSchoolYearAdmitted] = useState('2026-2027');

  // Guardians Form State (Every student must have at least two guardians, exactly 1 primary)
  const [guardians, setGuardians] = useState<GuardianRow[]>([
    {
      full_name: '',
      relationship: 'Mother',
      mobile_number: '',
      email: '',
      address: '',
      is_primary: true,
    },
    {
      full_name: '',
      relationship: 'Father',
      mobile_number: '',
      email: '',
      address: '',
      is_primary: false,
    },
  ]);

  // Enrollment Form State
  const [gradeLevel, setGradeLevel] = useState<number>(sections[0]?.grade_level || 10);
  const [sectionId, setSectionId] = useState<string>(sections[0]?.id || '');

  const availableSections = sections.filter(s => s.grade_level === gradeLevel);

  const handleAddGuardian = () => {
    setGuardians(prev => [
      ...prev,
      {
        full_name: '',
        relationship: 'Guardian',
        mobile_number: '',
        email: '',
        address: '',
        is_primary: false,
      },
    ]);
  };

  const handleRemoveGuardian = (index: number) => {
    if (guardians.length <= 2) {
      setErrorMsg('Every student must have at least two guardians registered.');
      return;
    }
    const target = guardians[index];
    const next = guardians.filter((_, i) => i !== index);
    if (target?.is_primary && next.length > 0) {
      next[0]!.is_primary = true;
    }
    setGuardians(next);
  };

  const handleSetPrimaryGuardian = (index: number) => {
    setGuardians(prev =>
      prev.map((g, i) => ({
        ...g,
        is_primary: i === index,
      }))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // Validate Required Fields
    if (!isValidLRN(lrn)) {
      setErrorMsg('LRN must be exactly 12 numeric digits.');
      setActiveTab('identity');
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      setErrorMsg('First name and last name are required.');
      setActiveTab('identity');
      return;
    }
    if (!birthdate.trim()) {
      setErrorMsg('Birth date is required.');
      setActiveTab('identity');
      return;
    }
    if (!barangay.trim() || !cityMunicipality.trim() || !province.trim()) {
      setErrorMsg('Barangay, City/Municipality, and Province are required.');
      setActiveTab('address');
      return;
    }

    if (guardians.length < 2) {
      setErrorMsg('Every student must have at least two guardians registered.');
      setActiveTab('guardians');
      return;
    }

    const invalidG = guardians.find(g => !g.full_name.trim() || !g.mobile_number.trim());
    if (invalidG) {
      setErrorMsg('All guardians must have a full name, relationship, and mobile number.');
      setActiveTab('guardians');
      return;
    }

    const invalidPhone = guardians.find(g => !isValidPHPhone(g.mobile_number));
    if (invalidPhone) {
      setErrorMsg(`Guardian "${invalidPhone.full_name}" has an invalid mobile number. Must be a valid Philippine number (+639... or 09...).`);
      setActiveTab('guardians');
      return;
    }

    const primaryGuardians = guardians.filter(g => g.is_primary);
    if (primaryGuardians.length !== 1) {
      setErrorMsg('Exactly one primary guardian must be designated.');
      setActiveTab('guardians');
      return;
    }

    if (!sectionId) {
      setErrorMsg('Section enrollment is required.');
      setActiveTab('enrollment');
      return;
    }

    const payload: StudentProfileInput = {
      lrn: lrn.trim(),
      first_name: firstName.trim(),
      middle_name: middleName.trim() || undefined,
      last_name: lastName.trim(),
      suffix: suffix.trim() || undefined,
      birthdate,
      sex,
      religion: religion.trim() || undefined,
      mother_tongue: motherTongue.trim() || undefined,
      ethnic_group: ethnicGroup.trim() || undefined,
      is_pwd: isPwd,
      is_4ps: is4ps,
      house_street: houseStreet.trim() || undefined,
      barangay: barangay.trim(),
      city_municipality: cityMunicipality.trim(),
      province: province.trim(),
      zip_code: zipCode.trim() || undefined,
      prev_school_name: prevSchoolName.trim() || undefined,
      prev_grade_level: typeof prevGradeLevel === 'number' ? prevGradeLevel : undefined,
      prev_general_average: typeof prevGeneralAverage === 'number' ? prevGeneralAverage : undefined,
      school_year_admitted: schoolYearAdmitted.trim() || undefined,
      grade_level: gradeLevel,
      section_id: sectionId,
      guardians: guardians.map(g => ({
        full_name: g.full_name.trim(),
        relationship: g.relationship.trim(),
        mobile_number: g.mobile_number.trim(),
        email: g.email.trim() || undefined,
        address: g.address.trim() || undefined,
        is_primary: g.is_primary,
      })),
    };

    try {
      setIsSubmitting(true);
      await registerStudentWithProfile(payload);
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to register student profile.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const tabs: { key: TabType; label: string; icon: any }[] = [
    { key: 'identity', label: '1. Identity', icon: User },
    { key: 'address', label: '2. Address', icon: MapPin },
    { key: 'personal', label: '3. Personal', icon: Heart },
    { key: 'school', label: '4. Prior School', icon: GraduationCap },
    { key: 'guardians', label: '5. Guardians', icon: Users },
    { key: 'enrollment', label: '6. Enrollment', icon: Building },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Complete Student Enrollment & Profile Registration"
      subtitle="DepEd Basic Education Enrollment Form (BEEF) Data Capture"
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Tab Headers */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-slate-200 dark:border-slate-800 text-xs">
          {tabs.map(t => {
            const Icon = t.icon;
            const isActive = activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-lg font-medium whitespace-nowrap transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary dark:text-emerald-400 font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab 1: Identity */}
        {activeTab === 'identity' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Learner Reference Number (LRN) <span className="text-rose-500">* (12 Digits)</span>
              </label>
              <input
                type="text"
                required
                maxLength={12}
                value={lrn}
                onChange={e => setLrn(e.target.value)}
                placeholder="e.g. 109823456789"
                className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  First Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="Juan"
                  className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Middle Name</label>
                <input
                  type="text"
                  value={middleName}
                  onChange={e => setMiddleName(e.target.value)}
                  placeholder="Santos"
                  className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Last Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="Dela Cruz"
                  className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Suffix (Optional)</label>
                <input
                  type="text"
                  value={suffix}
                  onChange={e => setSuffix(e.target.value)}
                  placeholder="Jr., III"
                  className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Birth Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={birthdate}
                  onChange={e => setBirthdate(e.target.value)}
                  className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Sex <span className="text-rose-500">*</span>
                </label>
                <select
                  value={sex}
                  onChange={e => setSex(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Address */}
        {activeTab === 'address' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                House No. / Street / Sitio
              </label>
              <input
                type="text"
                value={houseStreet}
                onChange={e => setHouseStreet(e.target.value)}
                placeholder="Block 12 Lot 4, Dahlia St."
                className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Barangay <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={barangay}
                  onChange={e => setBarangay(e.target.value)}
                  className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  City / Municipality <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={cityMunicipality}
                  onChange={e => setCityMunicipality(e.target.value)}
                  className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Province <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={province}
                  onChange={e => setProvince(e.target.value)}
                  className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">ZIP Code</label>
                <input
                  type="text"
                  value={zipCode}
                  onChange={e => setZipCode(e.target.value)}
                  className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Personal */}
        {activeTab === 'personal' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Religion</label>
                <input
                  type="text"
                  value={religion}
                  onChange={e => setReligion(e.target.value)}
                  placeholder="Roman Catholic"
                  className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Mother Tongue</label>
                <input
                  type="text"
                  value={motherTongue}
                  onChange={e => setMotherTongue(e.target.value)}
                  placeholder="Tagalog"
                  className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Ethnic Group (IP)</label>
                <input
                  type="text"
                  value={ethnicGroup}
                  onChange={e => setEthnicGroup(e.target.value)}
                  placeholder="e.g. Dumagat, None"
                  className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={isPwd}
                  onChange={e => setIsPwd(e.target.checked)}
                  className="rounded border-slate-300 text-primary focus:ring-primary w-4 h-4"
                />
                <span>Person with Disability (PWD / Special Needs)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={is4ps}
                  onChange={e => setIs4ps(e.target.checked)}
                  className="rounded border-slate-300 text-primary focus:ring-primary w-4 h-4"
                />
                <span>Pantawid Pamilyang Pilipino Program (4Ps) Beneficiary</span>
              </label>
            </div>
          </div>
        )}

        {/* Tab 4: Prior School */}
        {activeTab === 'school' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Previous School Attended
              </label>
              <input
                type="text"
                value={prevSchoolName}
                onChange={e => setPrevSchoolName(e.target.value)}
                placeholder="e.g. San Roque Elementary School"
                className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Last Grade Completed
                </label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={prevGradeLevel}
                  onChange={e => setPrevGradeLevel(e.target.value ? parseInt(e.target.value, 10) : '')}
                  placeholder="e.g. 9"
                  className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">General Average</label>
                <input
                  type="number"
                  step="0.01"
                  min={60}
                  max={100}
                  value={prevGeneralAverage}
                  onChange={e => setPrevGeneralAverage(e.target.value ? parseFloat(e.target.value) : '')}
                  placeholder="e.g. 88.50"
                  className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">School Year Admitted</label>
                <input
                  type="text"
                  value={schoolYearAdmitted}
                  onChange={e => setSchoolYearAdmitted(e.target.value)}
                  placeholder="2026-2027"
                  className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Guardians (Multiple, Primary Enforced) */}
        {activeTab === 'guardians' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Register parents/guardians. The primary contact receives automated SMS gate alerts.
              </span>
              <button
                type="button"
                onClick={handleAddGuardian}
                className="px-2.5 py-1 text-xs font-bold text-primary dark:text-emerald-400 bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add Guardian
              </button>
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {guardians.map((g, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 relative"
                >
                  <div className="flex items-center justify-between pb-1 border-b border-slate-200 dark:border-slate-700">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800 dark:text-slate-200">
                      <input
                        type="radio"
                        name="primaryGuardian"
                        checked={g.is_primary}
                        onChange={() => handleSetPrimaryGuardian(idx)}
                        className="text-primary focus:ring-primary w-4 h-4"
                      />
                      <span>Primary Contact (SMS Alerts)</span>
                    </label>
                    {guardians.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveGuardian(idx)}
                        className="text-slate-400 hover:text-rose-500 p-1"
                        title="Remove Guardian"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                        Full Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={g.full_name}
                        onChange={e => {
                          const val = e.target.value;
                          setGuardians(prev => prev.map((item, i) => (i === idx ? { ...item, full_name: val } : item)));
                        }}
                        placeholder="e.g. Maria Dela Cruz"
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                        Relationship <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={g.relationship}
                        onChange={e => {
                          const val = e.target.value;
                          setGuardians(prev => prev.map((item, i) => (i === idx ? { ...item, relationship: val } : item)));
                        }}
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      >
                        <option value="Mother">Mother</option>
                        <option value="Father">Father</option>
                        <option value="Grandmother">Grandmother</option>
                        <option value="Grandfather">Grandfather</option>
                        <option value="Aunt">Aunt</option>
                        <option value="Uncle">Uncle</option>
                        <option value="Sibling">Sibling</option>
                        <option value="Legal Guardian">Legal Guardian</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                        PH Mobile <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={g.mobile_number}
                        onChange={e => {
                          const val = e.target.value;
                          setGuardians(prev => prev.map((item, i) => (i === idx ? { ...item, mobile_number: val } : item)));
                        }}
                        placeholder="09171234567"
                        className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="email"
                      value={g.email}
                      onChange={e => {
                        const val = e.target.value;
                        setGuardians(prev => prev.map((item, i) => (i === idx ? { ...item, email: val } : item)));
                      }}
                      placeholder="Optional Email"
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                    <input
                      type="text"
                      value={g.address}
                      onChange={e => {
                        const val = e.target.value;
                        setGuardians(prev => prev.map((item, i) => (i === idx ? { ...item, address: val } : item)));
                      }}
                      placeholder="Optional Guardian Address"
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 6: Enrollment */}
        {activeTab === 'enrollment' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Grade Level</label>
                <select
                  value={gradeLevel}
                  onChange={e => {
                    const nextG = parseInt(e.target.value, 10);
                    setGradeLevel(nextG);
                    const matching = sections.filter(s => s.grade_level === nextG);
                    if (matching.length > 0) setSectionId(matching[0]!.id);
                  }}
                  className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  {[7, 8, 9, 10, 11, 12].map(lvl => (
                    <option key={lvl} value={lvl}>
                      Grade {lvl}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Section Assignment <span className="text-rose-500">*</span>
                </label>
                {availableSections.length > 0 ? (
                  <select
                    value={sectionId}
                    onChange={e => setSectionId(e.target.value)}
                    className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    {availableSections.map(sec => (
                      <option key={sec.id} value={sec.id}>
                        {sec.name} {sec.adviser_name ? `(Adviser: ${sec.adviser_name})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-3 text-xs rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300">
                    No sections configured for Grade {gradeLevel}. Please create a section in Academics first.
                  </div>
                )}
              </div>
            </div>

            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300 font-medium">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Data Privacy Act of 2012 (RA 10173) Consent Verified
              </span>
              <span className="font-bold">Active</span>
            </div>
          </div>
        )}

        {/* Modal Navigation Buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
          <div>
            {activeTab !== 'identity' && (
              <button
                type="button"
                onClick={() => {
                  const idx = tabs.findIndex(t => t.key === activeTab);
                  if (idx > 0) setActiveTab(tabs[idx - 1]!.key);
                }}
                className="px-3 py-2 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Previous
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            {activeTab !== 'enrollment' ? (
              <button
                type="button"
                onClick={() => {
                  const idx = tabs.findIndex(t => t.key === activeTab);
                  if (idx < tabs.length - 1) setActiveTab(tabs[idx + 1]!.key);
                }}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90"
              >
                Next Section
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 text-xs font-semibold rounded-xl bg-primary text-white hover:bg-primary/90 flex items-center gap-1.5 shadow-sm"
              >
                {isSubmitting ? 'Registering...' : 'Complete Enrollment'}
              </button>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
};
