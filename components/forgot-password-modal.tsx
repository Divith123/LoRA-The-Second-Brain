"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff, Check, X, HelpCircle } from "lucide-react";
import { useUser } from "./user-context";

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ForgotPasswordModal({ isOpen, onClose, onSuccess }: ForgotPasswordModalProps) {
  const { verifySecurityAnswer, resetPassword } = useUser();
  const [step, setStep] = useState<"username" | "question" | "reset">("username");
  const [username, setUsername] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState<any>(null);

  // Password strength validation
  const validatePasswordStrength = (password: string) => {
    const minLength = 12;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChars = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    const hasNoCommonWords = !/(password|123456|qwerty|admin|user|login)/i.test(password);

    return {
      isValid: password.length >= minLength &&
               hasUpperCase &&
               hasLowerCase &&
               hasNumbers &&
               hasSpecialChars &&
               hasNoCommonWords,
      checks: {
        length: password.length >= minLength,
        uppercase: hasUpperCase,
        lowercase: hasLowerCase,
        numbers: hasNumbers,
        special: hasSpecialChars,
        noCommon: hasNoCommonWords
      }
    };
  };

  const passwordValidation = validatePasswordStrength(newPassword);

  const handleUsernameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    setIsLoading(true);
    setError("");

    try {
      // Check if user exists and get their security question
      const foundUser = await verifySecurityAnswer(username.trim(), "");
      if (!foundUser) {
        setError("User not found or no security question set up.");
        setIsLoading(false);
        return;
      }

      setUser(foundUser);
      setStep("question");
    } catch (err) {
      setError("An error occurred. Please try again.");
    }

    setIsLoading(false);
  };

  const handleSecurityAnswerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!securityAnswer.trim()) return;

    setIsLoading(true);
    setError("");

    try {
      const verifiedUser = await verifySecurityAnswer(username.trim(), securityAnswer.trim());
      if (!verifiedUser) {
        setError("Incorrect security answer.");
        setIsLoading(false);
        return;
      }

      setStep("reset");
    } catch (err) {
      setError("An error occurred. Please try again.");
    }

    setIsLoading(false);
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword.trim() || !confirmPassword.trim()) return;

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!passwordValidation.isValid) {
      setError("New password does not meet security requirements.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const success = await resetPassword(username.trim(), securityAnswer.trim(), newPassword.trim());
      if (success) {
        onSuccess();
        onClose();
      } else {
        setError("Failed to reset password. Please try again.");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    }

    setIsLoading(false);
  };

  const resetModal = () => {
    setStep("username");
    setUsername("");
    setSecurityAnswer("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
    setUser(null);
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Blur Background */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal Card */}
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Forgot Password</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="h-8 w-8 p-0"
          >
            ✕
          </Button>
        </div>

        <Card className="border-0 shadow-none">
          <CardHeader className="text-center space-y-2 pb-4">
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
              <HelpCircle className="w-6 h-6 text-primary" />
            </div>
            <CardTitle className="text-lg">
              {step === "username" && "Enter Your Username"}
              {step === "question" && "Security Question"}
              {step === "reset" && "Reset Password"}
            </CardTitle>
            <CardDescription className="text-sm">
              {step === "username" && "Enter your username to retrieve your security question."}
              {step === "question" && "Answer your security question to proceed."}
              {step === "reset" && "Create a new secure password."}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {step === "username" && (
              <form onSubmit={handleUsernameSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-sm font-medium">
                    Username
                  </Label>
                  <Input
                    id="username"
                    type="text"
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="h-12 bg-background/50 border-muted focus:border-primary/50 transition-colors"
                    required
                  />
                </div>

                {error && (
                  <div className="text-sm text-destructive text-center bg-destructive/10 p-2 rounded-md">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-12 text-base font-medium"
                  disabled={isLoading || !username.trim()}
                >
                  {isLoading ? "Checking..." : "Continue"}
                </Button>
              </form>
            )}

            {step === "question" && user && (
              <form onSubmit={handleSecurityAnswerSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Security Question</Label>
                  <div className="p-3 bg-muted/50 rounded-lg text-sm">
                    {user.securityQuestion}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="securityAnswer" className="text-sm font-medium">
                    Your Answer
                  </Label>
                  <Input
                    id="securityAnswer"
                    type="text"
                    placeholder="Enter your answer"
                    value={securityAnswer}
                    onChange={(e) => setSecurityAnswer(e.target.value)}
                    className="h-12 bg-background/50 border-muted focus:border-primary/50 transition-colors"
                    required
                  />
                </div>

                {error && (
                  <div className="text-sm text-destructive text-center bg-destructive/10 p-2 rounded-md">
                    {error}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep("username")}
                    className="flex-1 h-12"
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 h-12 text-base font-medium"
                    disabled={isLoading || !securityAnswer.trim()}
                  >
                    {isLoading ? "Verifying..." : "Verify"}
                  </Button>
                </div>
              </form>
            )}

            {step === "reset" && (
              <form onSubmit={handlePasswordReset} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword" className="text-sm font-medium">
                    New Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showNewPassword ? "text" : "password"}
                      placeholder="Enter new password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="h-12 bg-background/50 border-muted focus:border-primary/50 transition-colors pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-sm font-medium">
                    Confirm New Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="h-12 bg-background/50 border-muted focus:border-primary/50 transition-colors pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {newPassword && (
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">Password requirements:</div>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      <div className={`flex items-center gap-1 ${passwordValidation.checks.length ? 'text-green-600' : 'text-red-500'}`}>
                        {passwordValidation.checks.length ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        12+ characters
                      </div>
                      <div className={`flex items-center gap-1 ${passwordValidation.checks.uppercase ? 'text-green-600' : 'text-red-500'}`}>
                        {passwordValidation.checks.uppercase ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        Uppercase letter
                      </div>
                      <div className={`flex items-center gap-1 ${passwordValidation.checks.lowercase ? 'text-green-600' : 'text-red-500'}`}>
                        {passwordValidation.checks.lowercase ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        Lowercase letter
                      </div>
                      <div className={`flex items-center gap-1 ${passwordValidation.checks.numbers ? 'text-green-600' : 'text-red-500'}`}>
                        {passwordValidation.checks.numbers ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        Number
                      </div>
                      <div className={`flex items-center gap-1 ${passwordValidation.checks.special ? 'text-green-600' : 'text-red-500'}`}>
                        {passwordValidation.checks.special ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        Special character
                      </div>
                      <div className={`flex items-center gap-1 ${passwordValidation.checks.noCommon ? 'text-green-600' : 'text-red-500'}`}>
                        {passwordValidation.checks.noCommon ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        No common words
                      </div>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="text-sm text-destructive text-center bg-destructive/10 p-2 rounded-md">
                    {error}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep("question")}
                    className="flex-1 h-12"
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 h-12 text-base font-medium"
                    disabled={isLoading || !newPassword.trim() || !confirmPassword.trim() || !passwordValidation.isValid}
                  >
                    {isLoading ? "Resetting..." : "Reset Password"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}