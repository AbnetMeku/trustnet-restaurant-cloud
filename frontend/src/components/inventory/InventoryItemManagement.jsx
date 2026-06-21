import React, { useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import InventoryItemsTab from "./InventoryItems/InventoryItemsTab";
import MenuRecipesTab from "./InventoryItems/MenuRecipesTab";

export default function InventoryItemManagement() {
  const [activeTab, setActiveTab] = useState("drinks");

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList className="mb-2">
        <TabsTrigger value="drinks">Drink Items</TabsTrigger>
        <TabsTrigger value="food">Food Items</TabsTrigger>
        <TabsTrigger value="recipes">Menu Recipes</TabsTrigger>
      </TabsList>

      <TabsContent value="drinks" className="space-y-5">
        <InventoryItemsTab mode="drink" />
      </TabsContent>

      <TabsContent value="food" className="space-y-5">
        <InventoryItemsTab mode="ingredient" />
      </TabsContent>

      <TabsContent value="recipes" className="space-y-5">
        <MenuRecipesTab />
      </TabsContent>
    </Tabs>
  );
}
