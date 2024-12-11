'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/table';
import { Checkbox } from '@/components/checkbox';
import { ChevronDownIcon, ChevronUpIcon, EllipsisVerticalIcon } from '@heroicons/react/20/solid';
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownMenu,
  DropdownDivider,
} from '@/components/dropdown';

function isOverdue(install_date) {
  if (!install_date) return false;
  const now = new Date();
  const diffDays = (now - new Date(install_date)) / (1000 * 60 * 60 * 24);
  return diffDays > 90;
}

function getTotalDays(install_date) {
  if (!install_date) return 0;
  const now = new Date();
  return (now - new Date(install_date)) / (1000 * 60 * 60 * 24);
}

function getOverdueDays(install_date) {
  return Math.floor(getTotalDays(install_date));
}

async function computeBatchOverdueCountsBackend(supabase, batches) {
  const newOverdueCounts = {};
  for (const batch of batches) {
    const { data: linesData } = await supabase.from('payroll_reports').select('details').eq('batch_id', batch.id);
    if (!linesData || linesData.length === 0) { newOverdueCounts[batch.id] = 0; continue; }

    const allIds = [];
    for (const line of linesData) {
      if (Array.isArray(line.details)) {
        for (const d of line.details) { if (d.white_glove_entry_id) allIds.push(d.white_glove_entry_id); }
      }
    }

    if (allIds.length === 0) { newOverdueCounts[batch.id] = 0; continue; }

    const { data: wgeData } = await supabase
      .from('white_glove_entries')
      .select('install_date,backend_paid')
      .in('id', allIds);

    if (!wgeData) { newOverdueCounts[batch.id] = 0; continue; }

    let overdueCount = 0;
    for (const w of wgeData) { if (!w.backend_paid && isOverdue(w.install_date)) overdueCount++; }
    newOverdueCounts[batch.id] = overdueCount;
  }
  return newOverdueCounts;
}

export default function BackendReportsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [batches, setBatches] = useState([]);
  const [batchOverdueCounts, setBatchOverdueCounts] = useState({});
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [reportLines, setReportLines] = useState([]);
  const [expandedAgents, setExpandedAgents] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [wgeMap, setWgeMap] = useState({});
  const [batchPaidMap, setBatchPaidMap] = useState({});

  useEffect(() => { fetchBatches(); }, []);

  async function fetchBatches() {
    setLoading(true);
    const { data: batchData } = await supabase
      .from('payroll_report_batches')
      .select('*')
      .order('created_at', { ascending: false });

    if (batchData) {
      const overdueCounts = await computeBatchOverdueCountsBackend(supabase, batchData);
      const newBatchPaidMap = {};
      for (const batch of batchData) {
        const { data: reportsData } = await supabase
          .from('payroll_reports')
          .select('backend_is_paid')
          .eq('batch_id', batch.id);
        if (reportsData && reportsData.length > 0) {
          const total = reportsData.length;
          const paidCount = reportsData.filter(r => r.backend_is_paid).length;
          const pct = ((paidCount / total) * 100).toFixed(2);
          newBatchPaidMap[batch.id] = { paidPercentage: parseFloat(pct) };
        } else {
          newBatchPaidMap[batch.id] = { paidPercentage: 0 };
        }
      }
      setBatches(batchData);
      setBatchOverdueCounts(overdueCounts);
      setBatchPaidMap(newBatchPaidMap);
    }
    setLoading(false);
  }

  async function loadBatchDetails(batch_id) {
    setLoading(true);
    const { data: linesData } = await supabase.from('payroll_reports').select('*').eq('batch_id', batch_id);
    if (linesData) {
      linesData.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      const allIds = [];
      for (const line of linesData) {
        if (Array.isArray(line.details)) {
          for (const d of line.details) { if (d.white_glove_entry_id) allIds.push(d.white_glove_entry_id); }
        }
      }

      let wgeById = {};
      if (allIds.length > 0) {
        const { data: wgeData } = await supabase.from('white_glove_entries').select('*').in('id', allIds);
        (wgeData || []).forEach(w => { wgeById[w.id] = w; });
      }

      for (let i = 0; i < linesData.length; i++) {
        const line = linesData[i];
        const lineAccs = Array.isArray(line.details) ? line.details : [];
        const allPaid = lineAccs.length > 0 && lineAccs.every(d => {
          const w = wgeById[d.white_glove_entry_id]; return w && w.backend_paid;
        });
        if (allPaid && !line.backend_is_paid) {
          line.backend_is_paid = true;
          supabase.from('payroll_reports').update({ backend_is_paid: true }).eq('id', line.id);
        }
      }

      setReportLines(linesData);
      setWgeMap(wgeById);
    }
    setLoading(false);
  }

  function enterBatch(batch_id) {
    setSelectedBatchId(batch_id);
    loadBatchDetails(batch_id);
  }

  async function goBack() {
    setSelectedBatchId(null);
    setReportLines([]);
    setWgeMap({});
    await fetchBatches(); // Refresh on return
  }

  function toggleAgentExpand(line) {
    setExpandedAgents(prev => {
      const newSet = new Set(prev);
      newSet.has(line.id) ? newSet.delete(line.id) : newSet.add(line.id);
      return newSet;
    });
  }

  async function togglePaid(line) {
    const newPaidValue = !line.backend_is_paid;
    const { data: updatedLineData } = await supabase
      .from('payroll_reports')
      .update({ backend_is_paid: newPaidValue })
      .eq('id', line.id)
      .select('*');
    if (!updatedLineData) return;
    let updatedLine = updatedLineData[0];

    const lineAccs = Array.isArray(updatedLine.details) ? updatedLine.details : [];
    const wgeIds = lineAccs.map(d => d.white_glove_entry_id);
    if (wgeIds.length > 0) {
      await supabase.from('white_glove_entries').update({ backend_paid: newPaidValue }).in('id', wgeIds);
      const newWgeMap = { ...wgeMap };
      wgeIds.forEach(id => { if (newWgeMap[id]) newWgeMap[id].backend_paid = newPaidValue; });
      setWgeMap(newWgeMap);
    }

    setReportLines(prev => prev.map(r => r.id === line.id ? updatedLine : r));
    if (newPaidValue) setExpandedAgents(prev => new Set([...prev, updatedLine.id]));
  }

  async function toggleAccountPaid(line, wgeId) {
    const wge = wgeMap[wgeId]; if (!wge) return;
    const newPaidValue = !wge.backend_paid;
    await supabase.from('white_glove_entries').update({ backend_paid: newPaidValue }).eq('id', wgeId);
    const newWgeMap = { ...wgeMap };
    newWgeMap[wgeId].backend_paid = newPaidValue;
    setWgeMap(newWgeMap);

    const lineAccs = Array.isArray(line.details) ? line.details : [];
    const allPaid = lineAccs.every(d => newWgeMap[d.white_glove_entry_id]?.backend_paid);
    if (allPaid && !line.backend_is_paid) {
      await supabase.from('payroll_reports').update({ backend_is_paid: true }).eq('id', line.id);
      setReportLines(prev => prev.map(r => r.id === line.id ? { ...r, backend_is_paid: true } : r));
    } else if (!allPaid && line.backend_is_paid) {
      await supabase.from('payroll_reports').update({ backend_is_paid: false }).eq('id', line.id);
      setReportLines(prev => prev.map(r => r.id === line.id ? { ...r, backend_is_paid: false } : r));
    }
  }

  function getPaidPercentage() {
    if (reportLines.length === 0) return '0';
    const paidCount = reportLines.filter(r => r.backend_is_paid).length;
    return ((paidCount / reportLines.length) * 100).toFixed(2);
  }

  function lineHasOverdue(line) {
    const lineAccs = Array.isArray(line.details) ? line.details : [];
    return lineAccs.some(d => {
      const w = wgeMap[d.white_glove_entry_id];
      return w && !w.backend_paid && isOverdue(w.install_date);
    });
  }

  function getMaxOverdueDaysForLine(line) {
    const lineAccs = Array.isArray(line.details) ? line.details : [];
    let maxTotalDays = 0;
    for (const d of lineAccs) {
      const w = wgeMap[d.white_glove_entry_id];
      if (w && !w.backend_paid) {
        const totalDays = getOverdueDays(w.install_date);
        if (totalDays > maxTotalDays) maxTotalDays = totalDays;
      }
    }
    return maxTotalDays;
  }

  function accountIsOverdue(wgeId) {
    const w = wgeMap[wgeId];
    return w && !w.backend_paid && isOverdue(w.install_date);
  }

  function getOverdueDaysForAccount(wgeId) {
    const w = wgeMap[wgeId];
    if (!w) return 0;
    return getOverdueDays(w.install_date);
  }

  async function renameBatch(batch) {
    const newName = window.prompt('Enter new batch name', batch.batch_name);
    if (newName && newName.trim()) {
      await supabase.from('payroll_report_batches').update({ batch_name: newName.trim() }).eq('id', batch.id);
      fetchBatches();
    }
  }

  async function deleteBatch(batch) {
    if (confirm(`Are you sure you want to delete ${batch.batch_name}?`)) {
      await supabase.from('payroll_reports').delete().eq('batch_id', batch.id);
      await supabase.from('payroll_report_batches').delete().eq('id', batch.id);
      fetchBatches();
    }
  }

  if (!selectedBatchId) {
    return (
      <div className="p-6 space-y-6 font-sans text-gray-900">
        <h2 className="text-2xl font-bold text-center">Saved Payroll Batches (Backend)</h2>
        {loading && <div>Loading...</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 relative">
          {batches.map((batch) => {
            const overdueCount = batchOverdueCounts[batch.id] || 0;
            const paidInfo = batchPaidMap[batch.id] || { paidPercentage: 0 };
            const pct = paidInfo.paidPercentage;
            return (
              <div
                key={batch.id}
                className="border rounded relative flex flex-col items-center cursor-pointer"
                onClick={() => enterBatch(batch.id)}
                style={{ background: `linear-gradient(to right, #22c55e ${pct}%, #e5e7eb ${pct}%)` }}
              >
                <div className="absolute top-2 left-2 bg-white bg-opacity-90 text-gray-800 text-sm font-bold px-2 py-1 rounded">
                  {pct}% Paid Out
                </div>
                {overdueCount > 0 && (
                  <span className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                    {overdueCount}
                  </span>
                )}
                <div className="absolute top-1/2 right-2 transform -translate-y-1/2 z-10" onClick={(e) => e.stopPropagation()}>
                  <Dropdown>
                    <DropdownButton as="div" className="cursor-pointer flex justify-center items-center">
                      <EllipsisVerticalIcon className="h-5 w-5 text-gray-500" />
                    </DropdownButton>
                    <DropdownMenu className="min-w-32" anchor="bottom end">
                      <DropdownItem onClick={() => renameBatch(batch)}>Rename</DropdownItem>
                      <DropdownDivider />
                      <DropdownItem onClick={() => deleteBatch(batch)}>Delete</DropdownItem>
                    </DropdownMenu>
                  </Dropdown>
                </div>
                <div className="w-full py-6 flex flex-col items-center" style={{ pointerEvents: 'none' }}>
                  <span className="text-lg font-semibold text-gray-900 text-center">{batch.batch_name}</span>
                  <div className="text-sm text-gray-700 text-center">
                    Created at: {new Date(batch.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const paidPercentage = getPaidPercentage();
  const paidPctNumber = parseFloat(paidPercentage);

  return (
    <div className="p-6 space-y-6 font-sans text-gray-900">
      <Button onClick={goBack}>Back to Batches</Button>
      <h3 className="text-lg font-bold mt-4">Batch Details (Backend)</h3>
      <div className="flex items-center space-x-4 mb-4">
        <div>Total lines: {reportLines.length}</div>
        <div>{paidPercentage}% paid out</div>
      </div>
      <div className="w-full bg-gray-200 h-2 rounded">
        <div className="bg-green-500 h-2 rounded" style={{ width: `${paidPctNumber}%` }}></div>
      </div>
      {loading && <div>Loading...</div>}
      <Table striped>
        <TableHead>
          <TableRow>
            <TableHeader></TableHeader>
            <TableHeader>Paid?</TableHeader>
            <TableHeader>Name</TableHeader>
            <TableHeader># Accounts</TableHeader>
            <TableHeader>Personal Total</TableHeader>
            <TableHeader>Backend</TableHeader>
            <TableHeader>Status</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {reportLines.map((line) => {
            const isAgentExpanded = expandedAgents.has(line.id);
            const personalTotalDisplay = typeof line.personal_total === 'number' ? `$${line.personal_total.toFixed(2)}` : 'N/A';
            const backendVal = line.backend_value || 0;
            const backendPerc = line.backend_percentage;
            const backendDisplay = (backendPerc !== null && !isNaN(backendPerc))
              ? `$${backendVal.toFixed(2)} (${backendPerc}%)`
              : 'N/A';
            const overdueLine = lineHasOverdue(line);
            let maxDays = overdueLine ? getMaxOverdueDaysForLine(line) : 0;
            if (overdueLine) maxDays = maxDays - 90;
            const lineStatus = overdueLine && !line.backend_is_paid
              ? `Overdue (${maxDays} days)`
              : (line.backend_is_paid ? 'Paid' : 'Unpaid');
            const lineRowClass = line.backend_is_paid ? 'bg-green-100' : (overdueLine ? 'bg-red-100' : '');
            const textClass = overdueLine ? 'text-red-700 font-bold' : '';
            const lineAccs = Array.isArray(line.details) ? line.details : [];

            return (
              <React.Fragment key={line.id}>
                <TableRow className={lineRowClass}>
                  <TableCell>
                    <Button size="sm" variant="plain" onClick={() => toggleAgentExpand(line)}>
                      {isAgentExpanded ? <ChevronUpIcon className="h-5 w-5" /> : <ChevronDownIcon className="h-5 w-5" />}
                    </Button>
                  </TableCell>
                  <TableCell><Checkbox checked={line.backend_is_paid} onChange={() => togglePaid(line)} /></TableCell>
                  <TableCell className={textClass}>{line.name}</TableCell>
                  <TableCell>{line.accounts}</TableCell>
                  <TableCell>{personalTotalDisplay}</TableCell>
                  <TableCell>{backendDisplay}</TableCell>
                  <TableCell>{lineStatus}</TableCell>
                </TableRow>
                {isAgentExpanded && (
                  <TableRow>
                    <TableCell colSpan={7} className="bg-gray-50">
                      <div className="p-4">
                        <h4 className="font-bold mb-2">Sales Details (Backend)</h4>
                        <Table striped>
                          <TableHead>
                            <TableRow>
                              <TableHeader></TableHeader>
                              <TableHeader>Order Number</TableHeader>
                              <TableHeader>Customer Name</TableHeader>
                              <TableHeader>Address</TableHeader>
                              <TableHeader>Plan</TableHeader>
                              <TableHeader>Install Date</TableHeader>
                              <TableHeader>Personal Commission</TableHeader>
                              <TableHeader>Status</TableHeader>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {lineAccs.map((acc, idx) => {
                              const w = wgeMap[acc.white_glove_entry_id];
                              if (!w) return null;
                              const personalCommDisplay = `$${(acc.personal_commission || 0).toFixed(2)}`;
                              const installDateDisplay = w.install_date ? new Date(w.install_date).toLocaleDateString() : 'N/A';
                              const overdueAcc = accountIsOverdue(w.id);
                              let overdueDays = overdueAcc ? getOverdueDaysForAccount(w.id) : 0;
                              if (overdueAcc) overdueDays = overdueDays - 90;
                              const accStatus = overdueAcc && !w.backend_paid
                                ? `Overdue (${overdueDays} days)`
                                : (w.backend_paid ? 'Paid' : 'Unpaid');
                              const accRowClass = w.backend_paid ? 'bg-green-50' : (overdueAcc ? 'bg-red-50' : '');

                              return (
                                <TableRow key={idx} className={accRowClass}>
                                  <TableCell>
                                    <Checkbox checked={!!w.backend_paid} onChange={() => toggleAccountPaid(line, w.id)} />
                                  </TableCell>
                                  <TableCell>{w.order_number}</TableCell>
                                  <TableCell>{w.customer_name}</TableCell>
                                  <TableCell>{`${w.customer_street_address || ''} ${w.customer_city || ''} ${w.customer_state || ''}`.trim()}</TableCell>
                                  <TableCell>{w.internet_speed || 'N/A'}</TableCell>
                                  <TableCell>{installDateDisplay}</TableCell>
                                  <TableCell>{personalCommDisplay}</TableCell>
                                  <TableCell>{accStatus}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
