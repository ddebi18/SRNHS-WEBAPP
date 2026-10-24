import React, { useState, useRef } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Section } from '@/types/domain.types';
import {
  parseBulkFile,
  validateBulkRows,
  executeBulkImport,
  generateTemplateBlob,
  generateErrorReportCsv,
  RowValidationResult,
} from '../lib/bulkImport';
import {
  Upload,
  Download,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileCheck,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface BulkStudentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  sections: Section[];
  onSuccess: () => void;
}

export const BulkStudentUploadModal: React.FC<BulkStudentUploadModalProps> = ({
  isOpen,
  onClose,
  sections,
  onSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [previewResults, setPreviewResults] = useState<RowValidationResult[] | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'valid' | 'invalid'>('all');
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<{
    imported: number;
    skipped: number;
    errors: { row: number; lrn: string; error: string }[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = () => {
    const blob = generateTemplateBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'SRNHS_Student_Enrollment_Template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setParseError(null);
    setPreviewResults(null);
    setImportSummary(null);

    try {
      setIsParsing(true);
      const rows = await parseBulkFile(selected);
      const validated = await validateBulkRows(rows, sections);
      setPreviewResults(validated);
    } catch (err: any) {
      setParseError(err.message || 'Failed to parse file.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleImport = async (onlyValid = true) => {
    if (!previewResults) return;
    const targetRows = onlyValid ? previewResults.filter(r => r.isValid) : previewResults;
    if (targetRows.length === 0) return;

    try {
      setIsImporting(true);
      const result = await executeBulkImport(targetRows);
      setImportSummary({
        imported: result.importedCount,
        skipped: result.skippedCount,
        errors: result.errors,
      });
      onSuccess();
    } catch (err: any) {
      setParseError(err.message || 'Error occurred while committing import.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleDownloadErrorReport = () => {
    if (!importSummary?.errors || importSummary.errors.length === 0) return;
    const blob = generateErrorReportCsv(importSummary.errors);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'SRNHS_Import_Error_Report.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const validCount = previewResults?.filter(r => r.isValid).length || 0;
  const invalidCount = previewResults?.filter(r => !r.isValid).length || 0;

  const filteredPreview = previewResults?.filter(r => {
    if (activeFilter === 'valid') return r.isValid;
    if (activeFilter === 'invalid') return !r.isValid;
    return true;
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Bulk Student Roster Upload"
      subtitle="Batch profile capture from Excel (.xlsx) or CSV with pre-commit validation"
      maxWidth="2xl"
    >
      <div className="space-y-4">
        {/* Step 1: Download Template Banner */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                Official BEEF Enrollment Template
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Includes sample rows, valid header columns, and guardian fields.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="px-3 py-1.5 text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-1.5 shadow-sm"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>Download Template (.xlsx)</span>
          </button>
        </div>

        {/* Step 2: Choose File */}
        {!previewResults && !importSummary && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-8 text-center cursor-pointer hover:border-primary/60 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-all"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <Upload className="w-10 h-10 text-slate-400 mx-auto mb-2" />
            <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {isParsing ? 'Parsing spreadsheet rows...' : 'Click or drag spreadsheet here'}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Supports .xlsx (Excel workbook) and .csv files
            </div>
          </div>
        )}

        {parseError && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <XCircle className="w-4 h-4 shrink-0" />
            <span>{parseError}</span>
          </div>
        )}

        {/* Step 3: Interactive Preview Table */}
        {previewResults && !importSummary && (
          <div className="space-y-3">
            {/* Filter Chips & Stats */}
            <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveFilter('all')}
                  className={cn(
                    'px-2.5 py-1 rounded-lg font-semibold transition-colors',
                    activeFilter === 'all'
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  )}
                >
                  All Rows ({previewResults.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter('valid')}
                  className={cn(
                    'px-2.5 py-1 rounded-lg font-semibold transition-colors flex items-center gap-1',
                    activeFilter === 'valid'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                  )}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Ready to Import ({validCount})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter('invalid')}
                  className={cn(
                    'px-2.5 py-1 rounded-lg font-semibold transition-colors flex items-center gap-1',
                    activeFilter === 'invalid'
                      ? 'bg-rose-600 text-white'
                      : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                  )}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Has Errors ({invalidCount})
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setPreviewResults(null);
                  setFile(null);
                }}
                className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> Select Another File
              </button>
            </div>

            {/* Scrollable Preview Table */}
            <div className="max-h-72 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 border-b border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300">
                  <tr>
                    <th className="py-2 px-3">Row</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3">LRN</th>
                    <th className="py-2 px-3">Student Name</th>
                    <th className="py-2 px-3">Grade & Section</th>
                    <th className="py-2 px-3">Guardian</th>
                    <th className="py-2 px-3">Validation Findings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredPreview?.map(item => (
                    <tr
                      key={item.row.rowNumber}
                      className={cn(
                        'hover:bg-slate-50/50 dark:hover:bg-slate-800/40',
                        !item.isValid && 'bg-rose-50/20 dark:bg-rose-950/10'
                      )}
                    >
                      <td className="py-2 px-3 font-mono text-slate-500">{item.row.rowNumber}</td>
                      <td className="py-2 px-3">
                        {item.isValid ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                            Valid
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300">
                            Error
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-mono font-semibold">{item.row.lrn}</td>
                      <td className="py-2 px-3 font-medium">
                        {item.row.first_name} {item.row.last_name}
                      </td>
                      <td className="py-2 px-3">
                        Grade {item.row.grade_level} — {item.row.section_name}
                      </td>
                      <td className="py-2 px-3">
                        <div className="font-medium">{item.row.guardian_name}</div>
                        <div className="text-[10px] font-mono text-slate-500">{item.row.guardian_phone}</div>
                      </td>
                      <td className="py-2 px-3">
                        {item.errors.length > 0 ? (
                          <div className="space-y-0.5">
                            {item.errors.map((err, ei) => (
                              <div key={ei} className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                                • {err}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[11px] text-emerald-600 dark:text-emerald-400">All checks passed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Commit Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {validCount} ready for commit &bull; {invalidCount} will be skipped
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={validCount === 0 || isImporting}
                  onClick={() => handleImport(true)}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-sm flex items-center gap-1.5"
                >
                  <FileCheck className="w-4 h-4" />
                  <span>{isImporting ? 'Importing Batch...' : `Import Valid (${validCount})`}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Import Result Summary */}
        {importSummary && (
          <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Bulk Import Completed
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Processed {importSummary.imported + importSummary.skipped} rows from {file?.name}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {importSummary.imported}
                </div>
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Students Enrolled
                </div>
              </div>
              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">
                  {importSummary.skipped}
                </div>
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Skipped / Errors
                </div>
              </div>
            </div>

            {importSummary.errors.length > 0 && (
              <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  Download detailed log of skipped rows:
                </span>
                <button
                  type="button"
                  onClick={handleDownloadErrorReport}
                  className="px-3 py-1.5 text-xs font-bold rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-rose-600 dark:text-rose-400 flex items-center gap-1.5 shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Error Report (.csv)</span>
                </button>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90"
              >
                Close &amp; View Roster
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
