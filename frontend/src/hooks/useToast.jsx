import * as React from "react";
import { ToastProvider, ToastViewport, Toast, ToastTitle, ToastDescription } from "../components/ui/toast.jsx";

const ToasterContext = React.createContext({});

export function Toaster({ children }) {
  const [toasts, setToasts] = React.useState([]);

  const addToast = React.useCallback((title, description, variant = "default") => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, title, description, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismissToast = React.useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToasterContext.Provider value={{ addToast, dismissToast }}>
      {children}
      <ToastProvider>
        <ToastViewport>
          {toasts.map((toast) => (
            <Toast
              key={toast.id}
              variant={toast.variant}
              onOpenChange={(open) => !open && dismissToast(toast.id)}
            >
              <div className="grid gap-1">
                {toast.title && <ToastTitle>{toast.title}</ToastTitle>}
                {toast.description && <ToastDescription>{toast.description}</ToastDescription>}
              </div>
            </Toast>
          ))}
        </ToastViewport>
      </ToastProvider>
    </ToasterContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToasterContext);
  if (!context) {
    throw new Error("useToast must be used within a Toaster");
  }
  return context;
}
