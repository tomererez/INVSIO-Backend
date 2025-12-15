import React, { createContext, useContext } from "react"
import { cn } from "@/lib/utils"

const TabsContext = createContext({})

const Tabs = ({ value, onValueChange, children, className }) => {
    return (
        <TabsContext.Provider value={{ value, onValueChange }}>
            <div className={cn("", className)}>{children}</div>
        </TabsContext.Provider>
    )
}

const TabsList = ({ className, children }) => (
    <div className={cn("inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground", className)}>
        {children}
    </div>
)

const TabsTrigger = ({ value, className, children }) => {
    const { value: selectedValue, onValueChange } = useContext(TabsContext)
    const isSelected = selectedValue === value

    const handleClick = (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (onValueChange) {
            onValueChange(value)
        }
    }

    return (
        <button
            type="button"
            className={cn(
                "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
                isSelected && "bg-background text-foreground shadow",
                className
            )}
            onClick={handleClick}
            data-state={isSelected ? "active" : "inactive"}
        >
            {children}
        </button>
    )
}

const TabsContent = ({ value, className, children }) => {
    const { value: selectedValue } = useContext(TabsContext)
    if (selectedValue !== value) return null
    return (
        <div className={cn("mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", className)}>
            {children}
        </div>
    )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
