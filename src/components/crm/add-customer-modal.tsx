"use client";

import { useState } from "react";
import { X, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface AddCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddCustomerModal({ isOpen, onClose }: AddCustomerModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    deliveryCode: "",
    name: "",
    mobile: "",
    location: "",
    zone: "ZONE 1",
    status: "PRIORITY",
    plan: "ELITE",
    type: "VEG",
    meal: "BF",
    goal: "WEIGHT LOSS",
    customization: "YES",
    inspection: "DONE",
    recipeId: "",
  });

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const res = await fetch("/api/crm/customers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "addCustomer",
          "DELIVERY CODE": formData.deliveryCode,
          NAME: formData.name,
          MOBILE: formData.mobile,
          LOCATION: formData.location,
          ZONE: formData.zone,
          STATUS: formData.status,
          PLAN: formData.plan,
          TYPE: formData.type,
          MEAL: formData.meal,
          GOAL: formData.goal,
          CUSTOMIZATION: formData.customization,
          INSPECTION: formData.inspection,
          "RECIPE ID": formData.recipeId,
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to add customer");
      }
      
      toast.success("Customer added successfully and synced to Google Sheet!");
      await queryClient.invalidateQueries({ queryKey: ["crm", "active-customers-sheet-v9"] });
      onClose();
      // Reset form
      setFormData({
        deliveryCode: "",
        name: "",
        mobile: "",
        location: "",
        zone: "ZONE 1",
        status: "PRIORITY",
        plan: "ELITE",
        type: "VEG",
        meal: "BF",
        goal: "WEIGHT LOSS",
        customization: "YES",
        inspection: "DONE",
        recipeId: "",
      });
    } catch (error: any) {
      toast.error(error.message || "Failed to add customer");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-crm bg-crm-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-crm-line p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-crm-ink">Add Customer</h2>
              <p className="text-xs text-crm-muted">Add a new customer to the CRM and Google Sheet</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-crm text-crm-muted transition-colors hover:bg-crm-cream-deep hover:text-crm-ink"
          >
            <X className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-crm-ink-soft">Delivery Code</label>
              <input
                type="text"
                name="deliveryCode"
                value={formData.deliveryCode}
                onChange={handleChange}
                placeholder="e.g. BDC0001"
                className="w-full rounded-crm border border-crm-line px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-crm-ink-soft">Name</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full rounded-crm border border-crm-line px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-crm-ink-soft">Mobile</label>
              <input
                type="text"
                name="mobile"
                value={formData.mobile}
                onChange={handleChange}
                className="w-full rounded-crm border border-crm-line px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-crm-ink-soft">Location</label>
              <input
                type="text"
                name="location"
                value={formData.location}
                onChange={handleChange}
                className="w-full rounded-crm border border-crm-line px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                required
              />
            </div>
            
            <div className="space-y-1">
              <label className="text-xs font-semibold text-crm-ink-soft">Zone</label>
              <select name="zone" value={formData.zone} onChange={handleChange} className="w-full rounded-crm border border-crm-line px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                <option value="ZONE 1">ZONE 1</option>
                <option value="ZONE 2">ZONE 2</option>
                <option value="ZONE 3">ZONE 3</option>
                <option value="ZONE 4">ZONE 4</option>
              </select>
            </div>
            
            <div className="space-y-1">
              <label className="text-xs font-semibold text-crm-ink-soft">Status</label>
              <select name="status" value={formData.status} onChange={handleChange} className="w-full rounded-crm border border-crm-line px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                <option value="PRIORITY">PRIORITY</option>
                <option value="ACTIVE">ACTIVE</option>
              </select>
            </div>
            
            <div className="space-y-1">
              <label className="text-xs font-semibold text-crm-ink-soft">Plan</label>
              <select name="plan" value={formData.plan} onChange={handleChange} className="w-full rounded-crm border border-crm-line px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                <option value="ELITE">ELITE</option>
                <option value="LITE">LITE</option>
                <option value="PRO">PRO</option>
              </select>
            </div>
            
            <div className="space-y-1">
              <label className="text-xs font-semibold text-crm-ink-soft">Type</label>
              <select name="type" value={formData.type} onChange={handleChange} className="w-full rounded-crm border border-crm-line px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                <option value="VEG">VEG</option>
                <option value="NON VEG">NON VEG</option>
              </select>
            </div>
            
            <div className="space-y-1">
              <label className="text-xs font-semibold text-crm-ink-soft">Meal</label>
              <select name="meal" value={formData.meal} onChange={handleChange} className="w-full rounded-crm border border-crm-line px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                <option value="BF">BF</option>
                <option value="LUNCH">LUNCH</option>
                <option value="DINNER">DINNER</option>
              </select>
            </div>
            
            <div className="space-y-1">
              <label className="text-xs font-semibold text-crm-ink-soft">Goal</label>
              <select name="goal" value={formData.goal} onChange={handleChange} className="w-full rounded-crm border border-crm-line px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                <option value="WEIGHT LOSS">WEIGHT LOSS</option>
                <option value="MUSCLE GAIN">MUSCLE GAIN</option>
                <option value="MAINTENANCE">MAINTENANCE</option>
              </select>
            </div>
            
            <div className="space-y-1">
              <label className="text-xs font-semibold text-crm-ink-soft">Customization</label>
              <select name="customization" value={formData.customization} onChange={handleChange} className="w-full rounded-crm border border-crm-line px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                <option value="YES">YES</option>
                <option value="NO">NO</option>
              </select>
            </div>
            
            <div className="space-y-1">
              <label className="text-xs font-semibold text-crm-ink-soft">Inspection</label>
              <select name="inspection" value={formData.inspection} onChange={handleChange} className="w-full rounded-crm border border-crm-line px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500">
                <option value="DONE">DONE</option>
                <option value="PENDING">PENDING</option>
              </select>
            </div>
            
            <div className="space-y-1">
              <label className="text-xs font-semibold text-crm-ink-soft">Recipe ID</label>
              <input
                type="text"
                name="recipeId"
                value={formData.recipeId}
                onChange={handleChange}
                placeholder="e.g. BSI027"
                className="w-full rounded-crm border border-crm-line px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3 border-t border-crm-line pt-5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-crm px-4 py-2 text-sm font-semibold text-crm-ink-soft hover:bg-crm-cream-deep"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-crm bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              {isSubmitting ? "Adding..." : "Add Customer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
