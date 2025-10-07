"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useUsers, useCreateUser } from "@/lib/database-hooks";
import { DatabaseService } from "@/lib/database";

interface User {
  id: string;
  name: string;
  password: string;
  createdAt: string;
}

interface UserContextType {
  users: User[];
  currentUser: User | null;
  login: (name: string, password: string) => Promise<boolean>;
  logout: () => void;
  createUser: (name: string, password: string) => Promise<boolean>;
  switchUser: (userId: string, password: string) => Promise<boolean>;
  deleteCurrentUser: (password: string) => Promise<boolean>;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const { data: users = [], isLoading: isLoadingUsers } = useUsers();
  const createUserMutation = useCreateUser();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionExpiry, setSessionExpiry] = useState<number | null>(null);

  // Session timeout: 8 hours
  const SESSION_TIMEOUT = 8 * 60 * 60 * 1000; // 8 hours in milliseconds

  useEffect(() => {
    // Load current user from localStorage (just the ID for session persistence)
    const storedCurrentUserId = localStorage.getItem("lora_current_user");
    const storedSessionExpiry = localStorage.getItem("lora_session_expiry");

    if (storedCurrentUserId && users.length > 0) {
      const currentUser = users.find((u: User) => u.id === storedCurrentUserId);

      // Check if session is still valid
      if (currentUser && storedSessionExpiry) {
        const expiryTime = parseInt(storedSessionExpiry);
        if (Date.now() < expiryTime) {
          setCurrentUser(currentUser);
          setSessionExpiry(expiryTime);
        } else {
          // Session expired, clear data
          localStorage.removeItem("lora_current_user");
          localStorage.removeItem("lora_session_expiry");
        }
      }
    } else if (users.length > 0) {
      // No stored user or user not found, clear localStorage
      localStorage.removeItem("lora_current_user");
      localStorage.removeItem("lora_session_expiry");
      setCurrentUser(null);
    }
    // Set loading to false only after users are loaded
    if (!isLoadingUsers) {
      setIsLoading(false);
    }
  }, [users, isLoadingUsers]);

  // Auto-logout on session expiry
  useEffect(() => {
    if (sessionExpiry) {
      const timeoutId = setTimeout(() => {
        logout();
      }, sessionExpiry - Date.now());

      return () => clearTimeout(timeoutId);
    }
  }, [sessionExpiry]);

  const createUser = async (name: string, password: string): Promise<boolean> => {
    try {
      const newUser = await createUserMutation.mutateAsync({ name, password });
      return !!newUser;
    } catch (error) {
      console.error("Error creating user:", error);
      return false;
    }
  };

  const login = async (name: string, password: string): Promise<boolean> => {
    try {
      const user = await DatabaseService.verifyUserPasswordByName(name, password);
      if (!user) {
        return false; // Invalid credentials
      }

      setCurrentUser(user);
      const expiryTime = Date.now() + SESSION_TIMEOUT;
      localStorage.setItem("lora_current_user", user.id);
      localStorage.setItem("lora_session_expiry", expiryTime.toString());
      setSessionExpiry(expiryTime);
      return true;
    } catch (error) {
      console.error("Error logging in:", error);
      return false;
    }
  };

  const switchUser = async (userId: string, password: string): Promise<boolean> => {
    try {
      const isValidPassword = await DatabaseService.verifyUserPassword(userId, password);
      if (!isValidPassword) {
        return false; // Invalid credentials
      }

      const user = await DatabaseService.getUserById(userId);
      if (!user) return false;

      setCurrentUser(user);
      const expiryTime = Date.now() + SESSION_TIMEOUT;
      localStorage.setItem("lora_current_user", user.id);
      localStorage.setItem("lora_session_expiry", expiryTime.toString());
      setSessionExpiry(expiryTime);
      return true;
    } catch (error) {
      console.error("Error switching user:", error);
      return false;
    }
  };

  const deleteCurrentUser = async (password: string): Promise<boolean> => {
    if (!currentUser) return false;

    try {
      const success = await DatabaseService.deleteUserByPassword(currentUser.id, password);
      if (success) {
        // Clear current user state
        setCurrentUser(null);
        setSessionExpiry(null);
        localStorage.removeItem("lora_current_user");
        localStorage.removeItem("lora_session_expiry");
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error deleting current user:", error);
      return false;
    }
  };

  const logout = () => {
    setCurrentUser(null);
    setSessionExpiry(null);
    localStorage.removeItem("lora_current_user");
    localStorage.removeItem("lora_session_expiry");
  };

  const isAuthenticated = currentUser !== null;

  return (
    <UserContext.Provider value={{
      users,
      currentUser,
      login,
      logout,
      createUser,
      switchUser,
      deleteCurrentUser,
      isAuthenticated,
      isLoading
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}