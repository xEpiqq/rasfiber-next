import { NextResponse } from 'next/server';
import { createServerComponentClient } from '../../../utils/supabase/supabaseAdmin';

export async function POST(request) {
  const supabaseAdmin = createServerComponentClient();

  try {
    const { newUser, customCommissions } = await request.json();

    // Create user with the Admin API and auto-confirm
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email: newUser.email,
      password: 'rasmussenoperations123',
      email_confirm: true,
      user_metadata: {
        name: newUser.name,
      },
    });

    if (userError) {
      console.error('Error creating user:', userError);
      return NextResponse.json({ error: userError.message }, { status: 500 });
    }

    const userId = userData.user.id;

    // Insert into profiles table
    const { error: profileError } = await supabaseAdmin.from('profiles').insert([
      {
        id: userId,
        name: newUser.name,
        email: newUser.email,
        is_manager: newUser.is_manager,
        personal_payscale_id: newUser.personal_payscale_id || null,
        manager_payscale_id: newUser.is_manager ? newUser.manager_payscale_id || null : null,
      },
    ]);

    if (profileError) {
      console.error('Error adding user profile:', profileError);
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    // Handle multiple managers if the user is not a manager
    if (!newUser.is_manager && newUser.manager_ids.length > 0) {
      const managerRelations = newUser.manager_ids.map((managerId) => ({
        user_id: userId,
        manager_id: managerId,
      }));

      const { error: relationError } = await supabaseAdmin
        .from('user_managers')
        .insert(managerRelations);

      if (relationError) {
        console.error('Error assigning managers to user:', relationError);
        return NextResponse.json({ error: relationError.message }, { status: 500 });
      }
    }

    // Handle assigned users if the new user is a manager
    if (newUser.is_manager && newUser.assignedUsers.length > 0) {
      const { error: assignError } = await supabaseAdmin
        .from('user_managers')
        .insert(
          newUser.assignedUsers.map((assignedUserId) => ({
            user_id: assignedUserId,
            manager_id: userId,
          }))
        );

      if (assignError) {
        console.error('Error assigning users to manager:', assignError);
        return NextResponse.json({ error: assignError.message }, { status: 500 });
      }
    }

    // Handle custom commissions if provided
    if (!newUser.personal_payscale_id && customCommissions.length > 0) {
      const commissions = customCommissions.map((commission) => ({
        user_id: userId,
        plan_id: parseInt(commission.plan_id),
        rep_commission_type: commission.rep_commission_type,
        rep_commission_value: parseFloat(commission.rep_commission_value),
        manager_commission_type: commission.manager_commission_type,
        manager_commission_value: parseFloat(commission.manager_commission_value),
      }));

      if (commissions.length > 0) {
        const { error: commissionError } = await supabaseAdmin
          .from('user_plan_commissions')
          .insert(commissions);

        if (commissionError) {
          console.error('Error adding user commissions:', commissionError);
          return NextResponse.json({ error: commissionError.message }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ message: 'User created successfully' }, { status: 200 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Unexpected error occurred' }, { status: 500 });
  }
}
