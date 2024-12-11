'use client';

import React, { useState, useMemo, useRef } from 'react';
import Papa from 'papaparse';
import { Button } from '@/components/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/table';
import { Input } from '@/components/input';
import { createClient } from '@/utils/supabase/client';

export default function PayrollTab() {
  const supabase = useMemo(() => createClient(), []);
  const [file1, setFile1] = useState(null);
  const [file2, setFile2] = useState(null);
  const [matches, setMatches] = useState([]);
  const [report, setReport] = useState([]);
  const [loading, setLoading] = useState(false);

  const file1Ref = useRef(null);
  const file2Ref = useRef(null);

  const handleFile1Click = () => file1Ref.current.click();
  const handleFile2Click = () => file2Ref.current.click();

  async function upsertPlansFromCSV(csv1Rows, csv2Rows) {
    const csv1PlanMap = {};
    for (const row of csv1Rows) {
      const planName = row['Plan Name']?.trim();
      let payoutStr = row['Payout'];
      if (planName && payoutStr) {
        payoutStr = payoutStr.replace('$', '').replace(',', '');
        const payoutVal = parseFloat(payoutStr);
        if (!isNaN(payoutVal) && csv1PlanMap[planName] === undefined) {
          csv1PlanMap[planName] = payoutVal;
        }
      }
    }
    const planSet = new Set();
    for (const row of csv2Rows) {
      const speed = row['Internet Speed']?.trim();
      if (speed) planSet.add(speed);
    }
    for (const planName of planSet) {
      const commission_amount = csv1PlanMap[planName] !== undefined ? csv1PlanMap[planName] : 0;
      const { error } = await supabase
        .from('plans')
        .upsert([{ name: planName, commission_amount }], { onConflict: 'name', ignoreDuplicates: true });
      if (error) console.error(error);
    }
  }

  async function upsertAgentsFromMatches(matchedRows) {
    const agentsMap = {};
    for (const row of matchedRows) {
      const wg = row.matchedWhiteGlove;
      const agentInfo = wg['Agent Seller Information']?.trim();
      if (agentInfo && agentsMap[agentInfo] === undefined) {
        const colonIndex = agentInfo.indexOf(':');
        const agentName = colonIndex >= 0 ? agentInfo.substring(colonIndex + 1).trim() : agentInfo;
        agentsMap[agentInfo] = agentName;
      }
    }
    for (const [identifier, name] of Object.entries(agentsMap)) {
      const { error } = await supabase
        .from('agents')
        .upsert([{ identifier, name }], { onConflict: 'identifier', ignoreDuplicates: true });
      if (error) console.error(error);
    }
  }

  function mapWhiteGloveRow(row) {
    return {
      customer_name: row['Customer Name'] || null,
      customer_street_address: row['Customer Street Address'] || null,
      customer_city: row['Customer City (Zipcode as of 7/26/2024)'] || null,
      customer_state: row['Customer State'] || null,
      ban: row['BAN'] || null,
      order_number: row['Order Number'] || null,
      order_status: row['Order Status'] || null,
      order_submission_date: row['Order Submission Date'] ? new Date(row['Order Submission Date']) : null,
      original_due_date: row['Original Due Date'] ? new Date(row['Original Due Date']) : null,
      updated_due_date: row['Updated Due Date'] ? new Date(row['Updated Due Date']) : null,
      order_completed_cancelled: row['Order Completed/Cancelled'] || null,
      customer_cbr: row['Customer CBR'] || null,
      partner_name: row['Partner Name'] || null,
      partner_sales_code: row['Partner Sales Code'] || null,
      audit_status: row['Audit Status'] || null,
      audit_closed: row['Audit Closed no longer on form as of 11/22/2024'] || null,
      who_cancelled_the_order: row['Who Cancelled the Order'] || null,
      did_you_intervene_on_the_order: row['Did you intervene on the order'] || null,
      notes: row['Notes'] || null,
      item_type: row['Item Type'] || null,
      path: row['Path'] || null,
      due_date_helper: row['Due Date Helper'] || null,
      migrating_from_legacy: row['Is the customer Migrating from Legacy Services? (7/26/2024 DSL means yes blank field means No)'] || null,
      legacy_or_brspd_fiber: row['Legacy or BRSPD Fiber?'] || null,
      cancellation_reason: row['Cancellation Reason'] || null,
      voice_qty: row['Voice_Qty'] ? parseInt(row['Voice_Qty'], 10) : null,
      hsi_qty: row['HSI_Qty'] ? parseInt(row['HSI_Qty'], 10) : null,
      internet_speed: row['Internet Speed'] || null,
      agent_seller_information: row['Agent Seller Information'] || null,
      modified_due_date: row['Modified Due Date'] ? new Date(row['Modified Due Date']) : null,
      modified_month: row['Modified Month'] ? parseInt(row['Modified Month'], 10) : null,
      month_issued: row['Month Issued'] ? parseInt(row['Month Issued'], 10) : null,
      year_issued: row['Year Issued'] ? parseInt(row['Year Issued'], 10) : null,
      month_completed: row['Month Completed'] ? parseInt(row['Month Completed'], 10) : null,
      year_completed: row['Year Completed'] ? parseInt(row['Year Completed'], 10) : null,
      month_due: row['Month Due'] ? parseInt(row['Month Due'], 10) : null,
      year_due: row['Year Due'] ? parseInt(row['Year Due'], 10) : null
    };
  }

  async function insertNewWhiteGloveEntries(matchedRows) {
    const entries = matchedRows.map((r) => mapWhiteGloveRow(r.matchedWhiteGlove));
    const { data, error } = await supabase
      .from('white_glove_entries')
      .upsert(entries, { onConflict: 'order_number', ignoreDuplicates: true });

    if (error) console.error('Error inserting white glove entries:', error);
    else console.log('New entries inserted:', data);
  }

  async function generateReport(matchedRows) {
    const { data: agents } = await supabase.from('agents').select('*');
    const { data: agentManagers } = await supabase.from('agent_managers').select('*');
    const { data: plans } = await supabase.from('plans').select('*');
    const { data: personalPayscalePlanCommissions } = await supabase.from('personal_payscale_plan_commissions').select('*');
    const { data: managerPayscalePlanCommissions } = await supabase.from('manager_payscale_plan_commissions').select('*');
    const { data: personalPayscales } = await supabase.from('personal_payscales').select('*');
    const { data: managerPayscales } = await supabase.from('manager_payscales').select('*');

    const agentsByIdentifier = {};
    (agents || []).forEach(a => { agentsByIdentifier[a.identifier] = a; });

    const plansByName = {};
    (plans || []).forEach(p => { plansByName[p.name] = p; });

    const personalCommissionMap = {};
    (personalPayscalePlanCommissions || []).forEach(c => {
      if (!personalCommissionMap[c.personal_payscale_id]) personalCommissionMap[c.personal_payscale_id] = {};
      personalCommissionMap[c.personal_payscale_id][c.plan_id] = c.rep_commission_value;
    });

    const managerCommissionMap = {};
    (managerPayscalePlanCommissions || []).forEach(c => {
      if (!managerCommissionMap[c.manager_payscale_id]) managerCommissionMap[c.manager_payscale_id] = {};
      managerCommissionMap[c.manager_payscale_id][c.plan_id] = c.manager_commission_value;
    });

    const agentById = {};
    (agents || []).forEach(a => { agentById[a.id] = a; });

    const managerForAgent = {};
    (agentManagers || []).forEach(am => { managerForAgent[am.agent_id] = am.manager_id; });

    const personalPayscalesById = {};
    (personalPayscales || []).forEach(p => { personalPayscalesById[p.id] = p; });

    const totals = {};
    (agents || []).forEach(a => {
      let upfront_percentage = null;
      let backend_percentage = null;
      if (a.personal_payscale_id && personalPayscalesById[a.personal_payscale_id]) {
        const up = parseFloat(personalPayscalesById[a.personal_payscale_id].upfront_percentage);
        const bp = parseFloat(personalPayscalesById[a.personal_payscale_id].backend_percentage);
        upfront_percentage = isNaN(up) ? null : up;
        backend_percentage = isNaN(bp) ? null : bp;
      }

      totals[a.id] = {
        name: a.name || a.identifier,
        accounts: 0,
        personalTotal: 0,
        managerTotal: 0,
        upfront_percentage,
        backend_percentage
      };
    });

    for (const row of matchedRows) {
      const wg = row.matchedWhiteGlove;
      const agentInfo = wg['Agent Seller Information']?.trim();
      const internetSpeed = wg['Internet Speed']?.trim();
      if (!agentInfo || !internetSpeed || !agentsByIdentifier[agentInfo] || !plansByName[internetSpeed]) continue;

      const agent = agentsByIdentifier[agentInfo];
      const plan = plansByName[internetSpeed];

      if (agent.personal_payscale_id && personalCommissionMap[agent.personal_payscale_id] && personalCommissionMap[agent.personal_payscale_id][plan.id] !== undefined) {
        totals[agent.id].accounts += 1;
        totals[agent.id].personalTotal += personalCommissionMap[agent.personal_payscale_id][plan.id] || 0;
      }

      const mgrId = managerForAgent[agent.id];
      if (mgrId && agentById[mgrId] && agentById[mgrId].manager_payscale_id &&
          managerCommissionMap[agentById[mgrId].manager_payscale_id] &&
          managerCommissionMap[agentById[mgrId].manager_payscale_id][plan.id] !== undefined) {
        totals[mgrId].managerTotal += managerCommissionMap[agentById[mgrId].manager_payscale_id][plan.id] || 0;
      }
    }

    const finalReport = Object.entries(totals).map(([agentId, data]) => {
      const personalTotal = data.personalTotal || 0;
      const managerTotal = data.managerTotal || 0;
      const grandTotal = personalTotal + managerTotal;

      let upfrontValue = null;
      if (data.upfront_percentage !== null && !isNaN(data.upfront_percentage)) {
        upfrontValue = personalTotal * (data.upfront_percentage / 100);
      }

      let backendValue = null;
      if (data.backend_percentage !== null && !isNaN(data.backend_percentage)) {
        backendValue = personalTotal * (data.backend_percentage / 100);
      }

      return {
        agentId,
        name: data.name,
        accounts: data.accounts,
        personalTotal,
        managerTotal,
        grandTotal,
        upfront_percentage: data.upfront_percentage,
        backend_percentage: data.backend_percentage,
        upfrontValue,
        backendValue
      };
    });

    setReport(finalReport);
  }

  const parseFiles = () => {
    if (!file1 || !file2) {
      alert('Please select both files.');
      return;
    }

    setLoading(true);
    Papa.parse(file1, {
      header: true,
      complete: (res1) => {
        Papa.parse(file2, {
          header: true,
          complete: async (res2) => {
            try {
              const data1 = res1.data;
              const data2 = res2.data;

              // Upsert plans
              await upsertPlansFromCSV(data1, data2);

              const orderMap = {};
              data2.forEach((row) => {
                if (row['Order Number']) orderMap[row['Order Number']] = row;
              });

              const matched = data1
                .filter((row) => row['Order Id'] && orderMap[row['Order Id']])
                .map((row) => ({ ...row, matchedWhiteGlove: orderMap[row['Order Id']] }));

              // Upsert agents
              await upsertAgentsFromMatches(matched);

              // Insert new white glove entries
              await insertNewWhiteGloveEntries(matched);

              setMatches(matched);
              await generateReport(matched);

              setLoading(false);
            } catch (err) {
              console.error(err);
              alert('Error processing files.');
              setLoading(false);
            }
          }
        });
      }
    });
  };

  const showGenerateReport = file1 && file2 && report.length === 0;

  return (
    <div className="p-6 space-y-6 font-sans text-gray-900">
      <h2 className="text-2xl font-bold">Payroll Report Generator</h2>
      <input type="file" ref={file1Ref} className="hidden" onChange={(e) => setFile1(e.target.files[0])} />
      <input type="file" ref={file2Ref} className="hidden" onChange={(e) => setFile2(e.target.files[0])} />
      <div className="flex items-center space-x-4">
        <Button onClick={handleFile1Click}>New installs</Button>
        {file1 && <span className="text-sm text-gray-600">{file1.name}</span>}
        <Button onClick={handleFile2Click}>White glove</Button>
        {file2 && <span className="text-sm text-gray-600">{file2.name}</span>}
      </div>
      {showGenerateReport && (
        <Button onClick={parseFiles} disabled={loading}>
          {loading ? 'Processing...' : 'Generate Report'}
        </Button>
      )}
      {report.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-bold mb-3">Payroll Report</h3>
          <Table striped>
            <TableHead>
              <TableRow>
                <TableHeader>Name</TableHeader>
                <TableHeader># Accounts</TableHeader>
                <TableHeader>Personal Total</TableHeader>
                <TableHeader>Manager Total</TableHeader>
                <TableHeader>Grand Total</TableHeader>
                <TableHeader>Upfront</TableHeader>
                <TableHeader>Backend</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {report.map((r) => {
                const personalTotalDisplay = typeof r.personalTotal === 'number'
                  ? `$${r.personalTotal.toFixed(2)}`
                  : 'N/A';
                const managerTotalDisplay = typeof r.managerTotal === 'number'
                  ? `$${r.managerTotal.toFixed(2)}`
                  : 'N/A';
                const grandTotalDisplay = typeof r.grandTotal === 'number'
                  ? `$${r.grandTotal.toFixed(2)}`
                  : 'N/A';
                const upfrontDisplay = (r.upfrontValue !== null && !isNaN(r.upfrontValue))
                  ? `$${r.upfrontValue.toFixed(2)} (${r.upfront_percentage}%)`
                  : 'N/A';
                const backendDisplay = (r.backendValue !== null && !isNaN(r.backendValue))
                  ? `$${r.backendValue.toFixed(2)} (${r.backend_percentage}%)`
                  : 'N/A';

                return (
                  <TableRow key={r.agentId}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{r.accounts}</TableCell>
                    <TableCell>{personalTotalDisplay}</TableCell>
                    <TableCell>{managerTotalDisplay}</TableCell>
                    <TableCell>{grandTotalDisplay}</TableCell>
                    <TableCell>{upfrontDisplay}</TableCell>
                    <TableCell>{backendDisplay}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
