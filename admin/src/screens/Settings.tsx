import { AutoRunSettings, RunLog } from "./AutoRun"
import { ModelPicker } from "./ModelPicker"
import { Users } from "./Users"

/** Master-only: everything that is about the system rather than one person's search. */
export function Settings() {
  return (
    <Users
      header={
        <>
          <ModelPicker />
          <AutoRunSettings />
          <RunLog />
        </>
      }
    />
  )
}
