import { useOrchestrationCrud } from './hooks/useOrchestrationCrud'
import { useOrchestrationRun } from './hooks/useOrchestrationRun'
import { useOrchestrationTransfer } from './hooks/useOrchestrationTransfer'

// Composicion de los tres hooks de orquestacion. Existe para que
// Orchestrations.jsx siga consumiendo una sola cosa; la logica vive en:
//
//   useOrchestrationCrud     lista, seleccion, alta/baja/modificacion
//   useOrchestrationRun      estado de corrida, polling y las tres acciones
//   useOrchestrationTransfer export e import en JSON
//
// El unico acoplamiento entre ellos es el que el dominio exige: run necesita
// saber que orquestacion esta seleccionada y como se llama (para el aviso del
// navegador), y transfer necesita la lista y poder recargarla.
export function useOrchestration(connection, sessionId, onSessionExpired) {
  const crud = useOrchestrationCrud(connection)
  const run = useOrchestrationRun(crud.selectedId, connection, sessionId, onSessionExpired, crud.selected?.name)
  const transfer = useOrchestrationTransfer(connection, crud.orchs, crud.reload)

  return {
    orchs: crud.orchs,
    loading: crud.loading,
    error: crud.error,
    selected: crud.selected,
    selectedId: crud.selectedId,
    setSelectedId: crud.setSelectedId,
    saving: crud.saving,
    createOrch: crud.createOrch,
    duplicateOrch: crud.duplicateOrch,
    deleteOrch: crud.deleteOrch,
    saveGraph: crud.saveGraph,
    commitName: crud.commitName,

    run: run.run,
    isRunning: run.isRunning,
    starting: run.starting,
    cancelling: run.cancelling,
    handleStart: run.handleStart,
    handleResume: run.handleResume,
    handleCancel: run.handleCancel,

    exportOrchestrations: transfer.exportOrchestrations,
    bulkImportOrchestrations: transfer.bulkImportOrchestrations,
  }
}
