'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Avatar } from '@/components/avatar';
import Image from 'next/image';
import { BanknotesIcon } from '@heroicons/react/20/solid';
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '@/components/dropdown';
import { Navbar, NavbarItem, NavbarSection, NavbarSpacer } from '@/components/navbar';
import {
  Sidebar,
  SidebarBody,
  SidebarFooter,
  SidebarHeader,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  SidebarSpacer,
} from '@/components/sidebar';
import { SidebarLayout } from '@/components/sidebar-layout';
import {
  ArrowRightStartOnRectangleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Cog8ToothIcon,
  LightBulbIcon,
  PlusIcon,
  ShieldCheckIcon,
  UserIcon,
} from '@heroicons/react/16/solid';
import {
  Cog6ToothIcon,
  HomeIcon,
  MagnifyingGlassIcon,
  QuestionMarkCircleIcon,
  SparklesIcon,
  UserIcon as UserIcon20,
  CurrencyDollarIcon,
  ChartBarIcon,
} from '@heroicons/react/20/solid';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';

function isOverdue(install_date) {
  if (!install_date) return false;
  const now = new Date();
  const diffDays = (now - new Date(install_date)) / (1000 * 60 * 60 * 24);
  return diffDays > 90;
}

const Example = ({ children }) => {
  const [user, setUser] = useState(null);
  const router = useRouter();
  const [backendOverdueCount, setBackendOverdueCount] = useState(0);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const fetchUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.error('Error fetching user:', error);
      } else {
        setUser(data.user);
      }
    };

    fetchUser();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    // Fetch all overdue backend accounts globally
    // Overdue: white_glove_entries not backend_paid and older than 90 days
    const fetchOverdueCount = async () => {
      const { data: wgeData, error } = await supabase
        .from('white_glove_entries')
        .select('install_date, backend_paid');

      if (error) {
        console.error('Error fetching white_glove_entries:', error);
        return;
      }

      let count = 0;
      for (const w of wgeData) {
        if (!w.backend_paid && isOverdue(w.install_date)) {
          count++;
        }
      }

      setBackendOverdueCount(count);
    };

    fetchOverdueCount();
  }, [supabase]);

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error signing out:', error);
    } else {
      router.push('/sign-in');
    }
  };

  const nonClickableClass = 'text-gray-600 dark:text-gray-400 cursor-default rounded-md';

  return (
    <SidebarLayout
      navbar={
        <Navbar>
          <NavbarSpacer />
          <NavbarSection>
            <NavbarItem
              aria-label="Search"
              className={`${nonClickableClass} flex items-center`}
            >
              <MagnifyingGlassIcon className="h-5 w-5" />
            </NavbarItem>
            <NavbarItem
              aria-label="Home"
              className={`${nonClickableClass} flex items-center`}
            >
              <HomeIcon className="h-5 w-5" />
            </NavbarItem>
            <Dropdown>
              <DropdownButton as={NavbarItem}>
                <Avatar src={user?.user_metadata?.avatar_url || '/snowma.jpeg'} square />
              </DropdownButton>
              <DropdownMenu className="min-w-64" anchor="bottom end">
                <DropdownItem
                  onClick={(e) => e.preventDefault()}
                  className="flex items-center cursor-default"
                >
                  <UserIcon className="h-5 w-5 mr-2" />
                  <DropdownLabel>My profile</DropdownLabel>
                </DropdownItem>
                <DropdownItem
                  onClick={(e) => e.preventDefault()}
                  className="flex items-center cursor-default"
                >
                  <Cog8ToothIcon className="h-5 w-5 mr-2" />
                  <DropdownLabel>Settings</DropdownLabel>
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem
                  onClick={(e) => e.preventDefault()}
                  className="flex items-center cursor-default"
                >
                  <ShieldCheckIcon className="h-5 w-5 mr-2" />
                  <DropdownLabel>Privacy policy</DropdownLabel>
                </DropdownItem>
                <DropdownItem
                  onClick={(e) => e.preventDefault()}
                  className="flex items-center cursor-default"
                >
                  <LightBulbIcon className="h-5 w-5 mr-2" />
                  <DropdownLabel>Share feedback</DropdownLabel>
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem onClick={handleSignOut} className="flex items-center cursor-pointer">
                  <ArrowRightStartOnRectangleIcon className="h-5 w-5 mr-2" />
                  <DropdownLabel>Sign out</DropdownLabel>
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </NavbarSection>
        </Navbar>
      }
      sidebar={
        <Sidebar>
          <SidebarHeader>
            <Dropdown>
              <DropdownButton as={SidebarItem} className="lg:mb-2.5 flex items-center">
                <Avatar src="/snowma.jpeg" />
                <SidebarLabel className="ml-2">
                  {user?.email || 'monkey@example.com'}
                </SidebarLabel>
                <ChevronDownIcon className="h-4 w-4 ml-auto" />
              </DropdownButton>
              <DropdownMenu className="min-w-80 lg:min-w-64" anchor="bottom start">
                <DropdownItem href="/teams/1/settings" className="flex items-center">
                  <Cog8ToothIcon className="h-5 w-5 mr-2" />
                  <DropdownLabel>Settings</DropdownLabel>
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem href="/teams/1" className="flex items-center">
                  <Avatar slot="icon" src="/snowma.jpeg" />
                  <DropdownLabel className="ml-2">
                    {user?.email || 'monkey@example.com'}
                  </DropdownLabel>
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem href="/teams/create" className="flex items-center">
                  <PlusIcon className="h-5 w-5 mr-2" />
                  <DropdownLabel>New team&hellip;</DropdownLabel>
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
            <SidebarSection>
              <SidebarItem className={`flex items-center ${nonClickableClass}`}>
                <MagnifyingGlassIcon className="h-5 w-5 mr-2" />
                <SidebarLabel>Search</SidebarLabel>
              </SidebarItem>
            </SidebarSection>
          </SidebarHeader>
          <SidebarBody>
            <SidebarSection>
              <SidebarItem
                className="flex items-center cursor-pointer text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-md"
                onClick={() => router.push('/protected/payroll')}
              >
                <CurrencyDollarIcon className="h-5 w-5 mr-2" />
                <SidebarLabel>Calculate</SidebarLabel>
              </SidebarItem>
              <SidebarItem
                className="flex items-center cursor-pointer text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-md"
                onClick={() => router.push('/protected/payscales')}
              >
                <ChartBarIcon className="h-5 w-5 mr-2" />
                <SidebarLabel>Payscales</SidebarLabel>
              </SidebarItem>
              <SidebarItem
                className="flex items-center cursor-pointer text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-md"
                onClick={() => router.push('/protected/frontend')}
              >
                <BanknotesIcon className="h-5 w-5 mr-2" />
                <SidebarLabel>Frontend</SidebarLabel>
              </SidebarItem>
              <SidebarItem
                className="flex items-center cursor-pointer text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-md relative"
                onClick={() => router.push('/protected/backend')}
              >
                <BanknotesIcon className="h-5 w-5 mr-2" />
                <SidebarLabel>Backend</SidebarLabel>
                {backendOverdueCount > 0 && (
                  <span className="absolute right-2 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-600 rounded-full">
                    {backendOverdueCount}
                  </span>
                )}
              </SidebarItem>
            </SidebarSection>
            <SidebarSpacer />
            <SidebarSection>
              <SidebarItem className={`flex items-center ${nonClickableClass}`}>
                <QuestionMarkCircleIcon className="h-5 w-5 mr-2" />
                <SidebarLabel>Support</SidebarLabel>
              </SidebarItem>
              <SidebarItem className={`flex items-center ${nonClickableClass}`}>
                <SparklesIcon className="h-5 w-5 mr-2" />
                <SidebarLabel>Changelog</SidebarLabel>
              </SidebarItem>
            </SidebarSection>
          </SidebarBody>
          <SidebarFooter className="max-lg:hidden">
            <Dropdown>
              <DropdownButton as={SidebarItem} className="flex items-center">
                <span className="flex min-w-0 items-center gap-3">
                  <Avatar
                    src={user?.user_metadata?.avatar_url || '/snowma.jpeg'}
                    className="size-10"
                    square
                    alt="Profile"
                  />
                  <span className="flex flex-col ml-2">
                    <span className="block truncate text-sm font-medium text-zinc-950 dark:text-white">
                      {user?.user_metadata?.full_name || 'User'}
                    </span>
                    <span className="block truncate text-xs font-normal text-zinc-500 dark:text-zinc-400">
                      {user?.email || 'monkey@example.com'}
                    </span>
                  </span>
                </span>
                <ChevronUpIcon className="h-4 w-4 ml-auto" />
              </DropdownButton>
              <DropdownMenu className="min-w-64" anchor="top start">
                <DropdownItem
                  onClick={(e) => e.preventDefault()}
                  className="flex items-center cursor-default"
                >
                  <UserIcon20 className="h-5 w-5 mr-2" />
                  <DropdownLabel>My profile</DropdownLabel>
                </DropdownItem>
                <DropdownItem
                  onClick={(e) => e.preventDefault()}
                  className="flex items-center cursor-default"
                >
                  <Cog8ToothIcon className="h-5 w-5 mr-2" />
                  <DropdownLabel>Settings</DropdownLabel>
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem
                  onClick={(e) => e.preventDefault()}
                  className="flex items-center cursor-default"
                >
                  <ShieldCheckIcon className="h-5 w-5 mr-2" />
                  <DropdownLabel>Privacy policy</DropdownLabel>
                </DropdownItem>
                <DropdownItem
                  onClick={(e) => e.preventDefault()}
                  className="flex items-center cursor-default"
                >
                  <LightBulbIcon className="h-5 w-5 mr-2" />
                  <DropdownLabel>Share feedback</DropdownLabel>
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem onClick={handleSignOut} className="flex items-center cursor-pointer">
                  <ArrowRightStartOnRectangleIcon className="h-5 w-5 mr-2" />
                  <DropdownLabel>Sign out</DropdownLabel>
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </SidebarFooter>
        </Sidebar>
      }
    >
      {children}
    </SidebarLayout>
  );
};

export default Example;
