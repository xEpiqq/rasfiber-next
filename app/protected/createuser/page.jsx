'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/button';
import { Input } from '@/components/input';
import { CheckboxField, Checkbox } from '@/components/checkbox';
import { Label } from '@/components/fieldset';
import { Select } from '@/components/select';
import { createClient } from '@/utils/supabase/client';

export default function CreateUserPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [isManager, setIsManager] = useState(false);
  const [personalPayscaleId, setPersonalPayscaleId] = useState('');
  const [managerPayscaleId, setManagerPayscaleId] = useState('');
  const [status, setStatus] = useState('');

  const [personalPayscaleOptions, setPersonalPayscaleOptions] = useState([]);
  const [managerPayscaleOptions, setManagerPayscaleOptions] = useState([]);

  useEffect(() => {
    (async () => {
      const { data: personal } = await supabase.from('personal_payscales').select('*');
      const { data: manager } = await supabase.from('manager_payscales').select('*');
      setPersonalPayscaleOptions(personal || []);
      setManagerPayscaleOptions(manager || []);
    })();
  }, [supabase]);

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('Creating user...');
    const newUser = {
      email,
      name,
      is_manager: isManager,
      personal_payscale_id: personalPayscaleId || null,
      manager_payscale_id: isManager ? (managerPayscaleId || null) : null,
      assignedUsers: [],
    };

    const res = await fetch('/api/createUser', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newUser }),
    });
    const json = await res.json();

    if (res.ok) {
      setStatus('User created successfully!');
      setEmail('');
      setName('');
      setIsManager(false);
      setPersonalPayscaleId('');
      setManagerPayscaleId('');
    } else {
      setStatus('Error: ' + (json.error || 'Unknown error'));
    }
  }

  return (
    <div className="p-6 space-y-6 font-sans text-gray-900">
      <h2 className="text-2xl font-bold">Create New User</h2>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
        <div>
          <Label>Email</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <Label>Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <CheckboxField>
          <Checkbox checked={isManager} onChange={setIsManager} />
          <Label>Is Manager?</Label>
        </CheckboxField>
        <div>
          <Label>Personal Payscale</Label>
          <Select
            value={personalPayscaleId}
            onChange={(e) => setPersonalPayscaleId(e.target.value)}
          >
            <option value="">Select Personal Payscale</option>
            {personalPayscaleOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        {isManager && (
          <div>
            <Label>Manager Payscale</Label>
            <Select
              value={managerPayscaleId}
              onChange={(e) => setManagerPayscaleId(e.target.value)}
            >
              <option value="">Select Manager Payscale</option>
              {managerPayscaleOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        <Button type="submit">Create User</Button>
      </form>
      {status && <div className="mt-4 text-sm text-gray-700">{status}</div>}
    </div>
  );
}
