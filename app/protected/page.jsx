'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import 'tailwindcss/tailwind.css';
import { Tab } from '@headlessui/react';
import { Button } from '@/components/button';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from '@/components/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/table';
import { Input } from '@/components/input';

const PayrollApp = () => {
  // State Management
  const [plans, setPlans] = useState([]);
  const [personalPayscales, setPersonalPayscales] = useState([]);
  const [managerPayscales, setManagerPayscales] = useState([]);
  const [users, setUsers] = useState([]);
  const [managers, setManagers] = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [personalPayscalesLoading, setPersonalPayscalesLoading] = useState(true);
  const [managerPayscalesLoading, setManagerPayscalesLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);

  const [newPlan, setNewPlan] = useState({ name: '', commission_amount: '' });
  const [newPersonalPayscale, setNewPersonalPayscale] = useState({
    name: '',
    commissions: {},
    upfront_percentage: '',
    backend_percentage: '',
  });
  const [newManagerPayscale, setNewManagerPayscale] = useState({
    name: '',
    commissions: {},
  });
  const [newUser, setNewUser] = useState({
    email: '',
    name: '',
    is_manager: null, // null to indicate no selection yet
    personal_payscale_id: '',
    manager_payscale_id: '',
    assignedUsers: [], // Array of user IDs assigned to this manager
  });

  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isPersonalPayscaleModalOpen, setIsPersonalPayscaleModalOpen] = useState(false);
  const [isManagerPayscaleModalOpen, setIsManagerPayscaleModalOpen] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  // Fetch Data on Component Mount
  useEffect(() => {
    fetchPlans();
    fetchPersonalPayscales();
    fetchManagerPayscales();
    fetchUsers();
    fetchManagers();
  }, []);

  // Fetch Functions
  const fetchPlans = async () => {
    setPlansLoading(true);
    const { data, error } = await supabase.from('plans').select('*');
    if (error) console.error('Error fetching plans:', error);
    else setPlans(data);
    setPlansLoading(false);
  };

  const fetchPersonalPayscales = async () => {
    setPersonalPayscalesLoading(true);
    const { data, error } = await supabase
      .from('personal_payscales')
      .select(`
        *,
        personal_payscale_plan_commissions (
          plan_id,
          rep_commission_value,
          plans (name)
        )
      `);
    if (error) console.error('Error fetching personal payscales:', error);
    else setPersonalPayscales(data);
    setPersonalPayscalesLoading(false);
  };

  const fetchManagerPayscales = async () => {
    setManagerPayscalesLoading(true);
    const { data, error } = await supabase
      .from('manager_payscales')
      .select(`
        *,
        manager_payscale_plan_commissions (
          plan_id,
          manager_commission_value,
          plans (name)
        )
      `);
    if (error) console.error('Error fetching manager payscales:', error);
    else setManagerPayscales(data);
    setManagerPayscalesLoading(false);
  };

  const fetchUsers = async () => {
    setUsersLoading(true);
    const { data, error } = await supabase.from('profiles').select('*');
    if (error) console.error('Error fetching users:', error);
    else setUsers(data);
    setUsersLoading(false);
  };

  const fetchManagers = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('is_manager', true);
    if (error) console.error('Error fetching managers:', error);
    else setManagers(data);
  };

  // Add Plan Function with Optimistic Update
  const addPlan = async () => {
    if (!newPlan.name || !newPlan.commission_amount) {
      alert('Please fill in all fields for the new plan.');
      return;
    }
    const commissionAmount = parseFloat(newPlan.commission_amount);
    if (isNaN(commissionAmount)) {
      alert('Please enter a valid commission amount.');
      return;
    }

    // Create a temporary plan for optimistic UI update
    const tempPlan = {
      id: Date.now(),
      name: newPlan.name,
      commission_amount: commissionAmount,
    };
    setPlans([...plans, tempPlan]);
    setIsPlanModalOpen(false);
    setNewPlan({ name: '', commission_amount: '' });

    // Insert into the database
    const { data, error } = await supabase
      .from('plans')
      .insert([{ name: newPlan.name, commission_amount: commissionAmount }])
      .select('*');

    if (error) {
      console.error('Error adding plan:', error);
      alert('Error adding plan: ' + error.message);
      // Revert the optimistic update
      setPlans(plans.filter((plan) => plan.id !== tempPlan.id));
      return;
    }

    if (data && data.length > 0) {
      // Replace the temporary plan with the actual data from DB
      setPlans((prevPlans) =>
        prevPlans.map((plan) => (plan.id === tempPlan.id ? data[0] : plan))
      );
    }
  };

  // Add Personal Payscale Function
  const addPersonalPayscale = async () => {
    if (!newPersonalPayscale.name) {
      alert('Please enter a name for the personal payscale.');
      return;
    }

    // Validate upfront and backend percentages
    const upfront = parseFloat(newPersonalPayscale.upfront_percentage);
    const backend = parseFloat(newPersonalPayscale.backend_percentage);

    if (isNaN(upfront) || upfront < 0 || upfront > 100) {
      alert('Please enter a valid upfront percentage (0-100).');
      return;
    }

    if (isNaN(backend) || backend < 0 || backend > 100) {
      alert('Please enter a valid backend percentage (0-100).');
      return;
    }

    // Validate commissions
    const commissionsArray = [];
    let allFieldsFilled = true;
    for (const planId of plans.map((plan) => plan.id)) {
      const value = newPersonalPayscale.commissions[planId];
      if (value === undefined || value === '') {
        allFieldsFilled = false;
        break;
      }
      if (isNaN(parseFloat(value))) {
        alert('Please enter valid commission values.');
        return;
      }
      commissionsArray.push({
        plan_id: parseInt(planId),
        rep_commission_value: parseFloat(value),
        rep_commission_type: 'fixed_amount',
      });
    }

    if (!allFieldsFilled) {
      alert('Please fill in all commission values.');
      return;
    }

    // Create a temporary payscale for optimistic UI update
    const tempPayscale = {
      id: Date.now(),
      name: newPersonalPayscale.name,
      upfront_percentage: upfront,
      backend_percentage: backend,
      personal_payscale_plan_commissions: commissionsArray.map((c) => ({
        plan_id: c.plan_id,
        rep_commission_value: c.rep_commission_value,
        plans: { name: plans.find((p) => p.id === c.plan_id)?.name || 'Unknown' },
      })),
    };
    setPersonalPayscales([...personalPayscales, tempPayscale]);
    setIsPersonalPayscaleModalOpen(false);
    setNewPersonalPayscale({ name: '', commissions: {}, upfront_percentage: '', backend_percentage: '' });

    // Insert payscale into the database
    const { data: payscaleData, error: payscaleError } = await supabase
      .from('personal_payscales')
      .insert([
        { 
          name: newPersonalPayscale.name, 
          upfront_percentage: upfront, 
          backend_percentage: backend 
        }
      ])
      .select('*');

    if (payscaleError) {
      console.error('Error adding personal payscale:', payscaleError);
      alert('Error adding personal payscale: ' + payscaleError.message);
      // Revert the optimistic update
      setPersonalPayscales(personalPayscales.filter((p) => p.id !== tempPayscale.id));
      return;
    }

    if (!payscaleData || payscaleData.length === 0) {
      alert('Failed to add personal payscale.');
      // Revert the optimistic update
      setPersonalPayscales(personalPayscales.filter((p) => p.id !== tempPayscale.id));
      return;
    }

    const payscaleId = payscaleData[0].id;

    // Prepare commissions for insertion
    const commissions = commissionsArray.map((commission) => ({
      personal_payscale_id: payscaleId,
      plan_id: commission.plan_id,
      rep_commission_type: 'fixed_amount',
      rep_commission_value: commission.rep_commission_value,
    }));

    // Insert commissions into the database
    const { error: commissionError } = await supabase
      .from('personal_payscale_plan_commissions')
      .insert(commissions);

    if (commissionError) {
      console.error('Error adding commissions:', commissionError);
      alert('Error adding commissions: ' + commissionError.message);
      // Optionally, delete the previously added payscale to maintain data integrity
      await supabase.from('personal_payscales').delete().eq('id', payscaleId);
      setPersonalPayscales(personalPayscales.filter((p) => p.id !== tempPayscale.id));
      return;
    }

    // Fetch the updated payscales with commissions to ensure data consistency
    fetchPersonalPayscales();
  };

  // Add Manager Payscale Function
  const addManagerPayscale = async () => {
    if (!newManagerPayscale.name) {
      alert('Please enter a name for the manager payscale.');
      return;
    }

    // Validate commissions
    const commissionsArray = [];
    let allFieldsFilled = true;
    for (const planId of plans.map((plan) => plan.id)) {
      const value = newManagerPayscale.commissions[planId];
      if (value === undefined || value === '') {
        allFieldsFilled = false;
        break;
      }
      if (isNaN(parseFloat(value))) {
        alert('Please enter valid commission values.');
        return;
      }
      commissionsArray.push({
        plan_id: parseInt(planId),
        manager_commission_value: parseFloat(value),
        manager_commission_type: 'fixed_amount',
      });
    }

    if (!allFieldsFilled) {
      alert('Please fill in all commission values.');
      return;
    }

    // Create a temporary payscale for optimistic UI update
    const tempPayscale = {
      id: Date.now(),
      name: newManagerPayscale.name,
      manager_payscale_plan_commissions: commissionsArray.map((c) => ({
        plan_id: c.plan_id,
        manager_commission_value: c.manager_commission_value,
        plans: { name: plans.find((p) => p.id === c.plan_id)?.name || 'Unknown' },
      })),
    };
    setManagerPayscales([...managerPayscales, tempPayscale]);
    setIsManagerPayscaleModalOpen(false);
    setNewManagerPayscale({ name: '', commissions: {} });

    // Insert payscale into the database
    const { data: payscaleData, error: payscaleError } = await supabase
      .from('manager_payscales')
      .insert([{ name: newManagerPayscale.name }])
      .select('*');

    if (payscaleError) {
      console.error('Error adding manager payscale:', payscaleError);
      alert('Error adding manager payscale: ' + payscaleError.message);
      // Revert the optimistic update
      setManagerPayscales(managerPayscales.filter((p) => p.id !== tempPayscale.id));
      return;
    }

    if (!payscaleData || payscaleData.length === 0) {
      alert('Failed to add manager payscale.');
      // Revert the optimistic update
      setManagerPayscales(managerPayscales.filter((p) => p.id !== tempPayscale.id));
      return;
    }

    const payscaleId = payscaleData[0].id;

    // Prepare commissions for insertion
    const commissions = commissionsArray.map((commission) => ({
      manager_payscale_id: payscaleId,
      plan_id: commission.plan_id,
      manager_commission_type: 'fixed_amount',
      manager_commission_value: commission.manager_commission_value,
    }));

    // Insert commissions into the database
    const { error: commissionError } = await supabase
      .from('manager_payscale_plan_commissions')
      .insert(commissions);

    if (commissionError) {
      console.error('Error adding commissions:', commissionError);
      alert('Error adding commissions: ' + commissionError.message);
      // Optionally, delete the previously added payscale to maintain data integrity
      await supabase.from('manager_payscales').delete().eq('id', payscaleId);
      setManagerPayscales(managerPayscales.filter((p) => p.id !== tempPayscale.id));
      return;
    }

    // Fetch the updated payscales with commissions to ensure data consistency
    fetchManagerPayscales();
  };

  // Handle Commission Changes in Personal Payscale Modal
  const handlePersonalPayscaleCommissionChange = (planId, value) => {
    setNewPersonalPayscale((prevState) => ({
      ...prevState,
      commissions: {
        ...prevState.commissions,
        [planId]: value,
      },
    }));
  };

  // Handle Commission Changes in Manager Payscale Modal
  const handleManagerPayscaleCommissionChange = (planId, value) => {
    setNewManagerPayscale((prevState) => ({
      ...prevState,
      commissions: {
        ...prevState.commissions,
        [planId]: value,
      },
    }));
  };

  // Add User Function with API Call
  const addUser = async () => {
    if (!newUser.email || !newUser.name || newUser.is_manager === null) {
      alert('Please fill in all required fields for the new user.');
      return;
    }

    // Ensure personal_payscale_id is selected
    if (!newUser.personal_payscale_id) {
      alert('Please select a personal payscale for the user.');
      return;
    }

    // For manager users, ensure manager_payscale_id is selected
    if (newUser.is_manager && !newUser.manager_payscale_id) {
      alert('Please select a manager payscale for the manager.');
      return;
    }

    // Prepare payload
    const payload = {
      newUser,
      customCommissions: [],
    };

    try {
      const response = await fetch('/api/createUser', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create user.');
      }

      alert('User created successfully.');
      // Refresh users list
      fetchUsers();
      fetchManagers();
      setIsUserModalOpen(false);
      setNewUser({
        email: '',
        name: '',
        is_manager: null,
        personal_payscale_id: '',
        manager_payscale_id: '',
        assignedUsers: [],
      });
    } catch (error) {
      console.error('Error creating user:', error);
      alert('Error creating user: ' + error.message);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <Tab.Group defaultIndex={0}>
        <Tab.List className="flex space-x-4 border-b mb-4">
          <Tab
            className={({ selected }) =>
              selected
                ? 'px-4 py-2 font-semibold text-blue-500 border-b-2 border-blue-500'
                : 'px-4 py-2 font-semibold text-gray-700 hover:text-blue-500'
            }
          >
            Users
          </Tab>
          <Tab
            className={({ selected }) =>
              selected
                ? 'px-4 py-2 font-semibold text-blue-500 border-b-2 border-blue-500'
                : 'px-4 py-2 font-semibold text-gray-700 hover:text-blue-500'
            }
          >
            Plans
          </Tab>
          <Tab
            className={({ selected }) =>
              selected
                ? 'px-4 py-2 font-semibold text-blue-500 border-b-2 border-blue-500'
                : 'px-4 py-2 font-semibold text-gray-700 hover:text-blue-500'
            }
          >
            Personal Payscales
          </Tab>
          <Tab
            className={({ selected }) =>
              selected
                ? 'px-4 py-2 font-semibold text-blue-500 border-b-2 border-blue-500'
                : 'px-4 py-2 font-semibold text-gray-700 hover:text-blue-500'
            }
          >
            Manager Payscales
          </Tab>
        </Tab.List>

        <Tab.Panels>
          {/* Users Tab */}
          <Tab.Panel>
            <section className="mb-12">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">Manage Users</h2>
                <Button onClick={() => setIsUserModalOpen(true)}>Add User</Button>
              </div>
              {usersLoading ? (
                <p>Loading users...</p>
              ) : (
                <Table striped>
                  <TableHead>
                    <TableRow>
                      <TableHeader>Name</TableHeader>
                      <TableHeader>Email</TableHeader>
                      <TableHeader>Is Manager</TableHeader>
                      <TableHeader>Manager</TableHeader>
                      <TableHeader>Personal Payscale</TableHeader>
                      <TableHeader>Manager Payscale</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {users.map((userItem) => (
                      <TableRow key={userItem.id}>
                        <TableCell>{userItem.name}</TableCell>
                        <TableCell>{userItem.email}</TableCell>
                        <TableCell>{userItem.is_manager ? 'Yes' : 'No'}</TableCell>
                        <TableCell>
                          {userItem.manager_id
                            ? users.find((u) => u.id === userItem.manager_id)?.name || 'N/A'
                            : 'N/A'}
                        </TableCell>
                        <TableCell>
                          {userItem.personal_payscale_id
                            ? personalPayscales.find((p) => p.id === userItem.personal_payscale_id)?.name ||
                              'N/A'
                            : 'N/A'}
                        </TableCell>
                        <TableCell>
                          {userItem.manager_payscale_id
                            ? managerPayscales.find((p) => p.id === userItem.manager_payscale_id)?.name ||
                              'N/A'
                            : userItem.is_manager ? 'N/A' : 'N/A'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>
          </Tab.Panel>

          {/* Plans Tab */}
          <Tab.Panel>
            <section className="mb-12">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">Manage Plans</h2>
                <Button onClick={() => setIsPlanModalOpen(true)}>Add Plan</Button>
              </div>
              {plansLoading ? (
                <p>Loading plans...</p>
              ) : (
                <Table striped>
                  <TableHead>
                    <TableRow>
                      <TableHeader>Plan Name</TableHeader>
                      <TableHeader>Commission Amount</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {plans.map((plan) => (
                      <TableRow key={plan.id}>
                        <TableCell>{plan.name}</TableCell>
                        <TableCell>${parseFloat(plan.commission_amount).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>
          </Tab.Panel>

          {/* Personal Payscales Tab */}
          <Tab.Panel>
            <section className="mb-12">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">Manage Personal Payscales</h2>
                <Button onClick={() => setIsPersonalPayscaleModalOpen(true)}>
                  Add Personal Payscale
                </Button>
              </div>
              {personalPayscalesLoading ? (
                <p>Loading personal payscales...</p>
              ) : (
                <Table striped>
                  <TableHead>
                    <TableRow>
                      <TableHeader>Payscale Name</TableHeader>
                      <TableHeader>Upfront (%)</TableHeader>
                      <TableHeader>Backend (%)</TableHeader>
                      <TableHeader>Summary</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {personalPayscales.map((payscale) => (
                      <TableRow key={payscale.id}>
                        <TableCell>{payscale.name}</TableCell>
                        <TableCell>{payscale.upfront_percentage}%</TableCell>
                        <TableCell>{payscale.backend_percentage}%</TableCell>
                        <TableCell>
                          {payscale.personal_payscale_plan_commissions &&
                          payscale.personal_payscale_plan_commissions.length > 0
                            ? payscale.personal_payscale_plan_commissions.map(
                                (commission, idx) => (
                                  <div key={idx}>
                                    {commission.plans.name}: $
                                    {parseFloat(
                                      commission.rep_commission_value
                                    ).toFixed(2)}
                                  </div>
                                )
                              )
                            : 'No commissions set.'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>
          </Tab.Panel>

          {/* Manager Payscales Tab */}
          <Tab.Panel>
            <section className="mb-12">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">Manage Manager Payscales</h2>
                <Button onClick={() => setIsManagerPayscaleModalOpen(true)}>
                  Add Manager Payscale
                </Button>
              </div>
              {managerPayscalesLoading ? (
                <p>Loading manager payscales...</p>
              ) : (
                <Table striped>
                  <TableHead>
                    <TableRow>
                      <TableHeader>Payscale Name</TableHeader>
                      <TableHeader>Summary</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {managerPayscales.map((payscale) => (
                      <TableRow key={payscale.id}>
                        <TableCell>{payscale.name}</TableCell>
                        <TableCell>
                          {payscale.manager_payscale_plan_commissions &&
                          payscale.manager_payscale_plan_commissions.length > 0
                            ? payscale.manager_payscale_plan_commissions.map(
                                (commission, idx) => (
                                  <div key={idx}>
                                    {commission.plans.name}: $
                                    {parseFloat(
                                      commission.manager_commission_value
                                    ).toFixed(2)}
                                  </div>
                                )
                              )
                            : 'No commissions set.'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>
          </Tab.Panel>
        </Tab.Panels>
      </Tab.Group>

      {/* Add Plan Modal */}
      <Dialog open={isPlanModalOpen} onClose={() => setIsPlanModalOpen(false)}>
        <DialogTitle>Add New Plan</DialogTitle>
        <DialogBody>
          <div className="mb-4">
            <label className="block mb-2">Plan Name</label>
            <Input
              type="text"
              placeholder="Plan Name"
              value={newPlan.name}
              onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })}
              className="focus:outline-none"
            />
          </div>
          <div className="mb-4">
            <label className="block mb-2">Commission Amount</label>
            <div className="flex items-center">
              <span className="mr-2 text-gray-700">$</span>
              <Input
                type="number"
                placeholder="Commission Amount"
                value={newPlan.commission_amount}
                onChange={(e) =>
                  setNewPlan({ ...newPlan, commission_amount: e.target.value })
                }
                className="flex-grow focus:outline-none"
              />
            </div>
          </div>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setIsPlanModalOpen(false)}>
            Cancel
          </Button>
          <Button onClick={addPlan}>Add Plan</Button>
        </DialogActions>
      </Dialog>

      {/* Add Personal Payscale Modal */}
      <Dialog
        open={isPersonalPayscaleModalOpen}
        onClose={() => setIsPersonalPayscaleModalOpen(false)}
        size="xl"
      >
        <DialogTitle>Add New Personal Payscale</DialogTitle>
        <DialogBody>
          <div className="mb-4">
            <label className="block mb-2">Payscale Name</label>
            <Input
              type="text"
              placeholder="Payscale Name"
              value={newPersonalPayscale.name}
              onChange={(e) =>
                setNewPersonalPayscale({
                  ...newPersonalPayscale,
                  name: e.target.value,
                })
              }
              className="focus:outline-none"
            />
          </div>

          {/* Upfront and Backend Percentage Fields */}
          <div className="mb-4">
            <h3 className="font-semibold mb-2">Commission Percentages</h3>
            <div className="flex space-x-4">
              <div className="w-1/2">
                <label className="block mb-2">Upfront (%)</label>
                <div className="flex items-center">
                  <Input
                    type="number"
                    placeholder="Upfront Percentage"
                    value={newPersonalPayscale.upfront_percentage}
                    onChange={(e) =>
                      setNewPersonalPayscale({
                        ...newPersonalPayscale,
                        upfront_percentage: e.target.value,
                      })
                    }
                    className="flex-grow focus:outline-none"
                  />
                  <span className="ml-2 text-gray-700">%</span>
                </div>
              </div>
              <div className="w-1/2">
                <label className="block mb-2">Backend (%)</label>
                <div className="flex items-center">
                  <Input
                    type="number"
                    placeholder="Backend Percentage"
                    value={newPersonalPayscale.backend_percentage}
                    onChange={(e) =>
                      setNewPersonalPayscale({
                        ...newPersonalPayscale,
                        backend_percentage: e.target.value,
                      })
                    }
                    className="flex-grow focus:outline-none"
                  />
                  <span className="ml-2 text-gray-700">%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <h3 className="font-semibold mb-2">Commission Values</h3>
            {plans.map((plan) => (
              <div key={plan.id} className="flex items-center mb-2">
                <div className="w-1/2">{plan.name}</div>
                <div className="w-1/2">
                  <div className="flex">
                    <span className="mr-2 text-gray-700">$</span>
                    <Input
                      type="number"
                      placeholder="Commission Value"
                      value={newPersonalPayscale.commissions[plan.id] || ''}
                      onChange={(e) =>
                        handlePersonalPayscaleCommissionChange(plan.id, e.target.value)
                      }
                      className="flex-grow focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setIsPersonalPayscaleModalOpen(false)}>
            Cancel
          </Button>
          <Button onClick={addPersonalPayscale}>Add Payscale</Button>
        </DialogActions>
      </Dialog>

      {/* Add Manager Payscale Modal */}
      <Dialog
        open={isManagerPayscaleModalOpen}
        onClose={() => setIsManagerPayscaleModalOpen(false)}
        size="xl"
      >
        <DialogTitle>Add New Manager Payscale</DialogTitle>
        <DialogBody>
          <div className="mb-4">
            <label className="block mb-2">Payscale Name</label>
            <Input
              type="text"
              placeholder="Payscale Name"
              value={newManagerPayscale.name}
              onChange={(e) =>
                setNewManagerPayscale({
                  ...newManagerPayscale,
                  name: e.target.value,
                })
              }
              className="focus:outline-none"
            />
          </div>
          <div className="mb-4">
            <h3 className="font-semibold mb-2">Commission Values</h3>
            {plans.map((plan) => (
              <div key={plan.id} className="flex items-center mb-2">
                <div className="w-1/2">{plan.name}</div>
                <div className="w-1/2">
                  <div className="flex">
                    <span className="mr-2 text-gray-700">$</span>
                    <Input
                      type="number"
                      placeholder="Commission Value"
                      value={newManagerPayscale.commissions[plan.id] || ''}
                      onChange={(e) =>
                        handleManagerPayscaleCommissionChange(plan.id, e.target.value)
                      }
                      className="flex-grow focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setIsManagerPayscaleModalOpen(false)}>
            Cancel
          </Button>
          <Button onClick={addManagerPayscale}>Add Payscale</Button>
        </DialogActions>
      </Dialog>

      {/* Add User Modal */}
      <Dialog
        open={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        size="xl"
      >
        <DialogTitle>Add New User</DialogTitle>
        <DialogBody>
          <div className="mb-4">
            <label className="block mb-2">Email</label>
            <Input
              type="email"
              placeholder="Email"
              value={newUser.email}
              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              className="focus:outline-none"
            />
          </div>
          <div className="mb-4">
            <label className="block mb-2">Name</label>
            <Input
              type="text"
              placeholder="Name"
              value={newUser.name}
              onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              className="focus:outline-none"
            />
          </div>
          <div className="mb-4">
            <label className="block mb-2">Is Manager?</label>
            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="is_manager"
                  value="yes"
                  checked={newUser.is_manager === true}
                  onChange={() => setNewUser({ ...newUser, is_manager: true })}
                  className="mr-2"
                />
                Yes
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="is_manager"
                  value="no"
                  checked={newUser.is_manager === false}
                  onChange={() => setNewUser({ ...newUser, is_manager: false })}
                  className="mr-2"
                />
                No
              </label>
            </div>
          </div>
          {newUser.is_manager !== null && (
            <>
              <div className="mb-4">
                <label className="block mb-2">Personal Payscale</label>
                <select
                  value={newUser.personal_payscale_id}
                  onChange={(e) =>
                    setNewUser({ ...newUser, personal_payscale_id: e.target.value })
                  }
                  className="border p-2 rounded w-full focus:outline-none"
                >
                  <option value="">Select Personal Payscale</option>
                  {personalPayscales.map((payscale) => (
                    <option key={payscale.id} value={payscale.id}>
                      {payscale.name}
                    </option>
                  ))}
                </select>
              </div>
              {newUser.is_manager && (
                <>
                  <div className="mb-4">
                    <label className="block mb-2">Manager Payscale</label>
                    <select
                      value={newUser.manager_payscale_id}
                      onChange={(e) =>
                        setNewUser({ ...newUser, manager_payscale_id: e.target.value })
                      }
                      className="border p-2 rounded w-full focus:outline-none"
                    >
                      <option value="">Select Manager Payscale</option>
                      {managerPayscales.map((payscale) => (
                        <option key={payscale.id} value={payscale.id}>
                          {payscale.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-4">
                    <label className="block mb-2">Assign Users</label>
                    <select
                      multiple
                      value={newUser.assignedUsers}
                      onChange={(e) =>
                        setNewUser({
                          ...newUser,
                          assignedUsers: Array.from(
                            e.target.selectedOptions,
                            (option) => option.value
                          ),
                        })
                      }
                      className="border p-2 rounded w-full focus:outline-none"
                      style={{ height: '200px' }} // Adjust the height as needed
                    >
                      {users
                        .filter((user) => !user.is_manager && !user.manager_id)
                        .map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.name}
                          </option>
                        ))}
                    </select>
                    <small className="text-gray-600">
                      Hold Ctrl (Windows) or Command (Mac) to select multiple users.
                    </small>
                  </div>
                </>
              )}
            </>
          )}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setIsUserModalOpen(false)}>
            Cancel
          </Button>
          <Button onClick={addUser}>Create User</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default PayrollApp;
