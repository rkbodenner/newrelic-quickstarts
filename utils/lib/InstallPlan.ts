import * as path from 'path';
import * as glob from 'glob';

import Component from './Component';
import { removeRepoPathPrefix } from './helpers';
import { fetchNRGraphqlResults } from '../nr-graphql-helpers';

import type {
  InstallPlanConfig,
  InstallPlanConfigTargetOS,
  InstallPlanInstall,
} from '../types/InstallPlanConfig';
import type {
  InstallPlanDirectiveInput,
  InstallPlanMutationVariable,
  InstallPlanTargetInput,
} from '../types/InstallPlanMutationVariables';

interface InstallPlanMutationResponse {
  installPlanStep: {
    id: string;
  };
}

const gql = String.raw;

export const INSTALL_PLAN_MUTATION = gql`
  # gql
  mutation QuickstartRepoInstallPlanMutation(
    $description: String!
    $dryRun: Boolean
    $displayName: String!
    $fallback: Nr1CatalogInstallPlanDirectiveInput
    $heading: String!
    $id: ID!
    $primary: Nr1CatalogInstallPlanDirectiveInput!
    $target: Nr1CatalogInstallPlanTargetInput!
  ) {
    nr1CatalogSubmitInstallPlanStep(
      dryRun: $dryRun
      installPlanStep: {
        description: $description
        displayName: $displayName
        fallback: $fallback
        heading: $heading
        id: $id
        primary: $primary
        target: $target
      }
    ) {
      installPlanStep {
        id
      }
    }
  }
`;

class InstallPlan extends Component<InstallPlanConfig, string> {
  /**
   * @returns Filepath for the configuration file (from top-level directory).
   */
  getConfigFilePath() {
    const filePaths = glob.sync(
      path.join(this.basePath, 'install', this.localPath, 'install.{yml|yaml}')
    );

    if (!Array.isArray(filePaths) || filePaths.length !== 1) {
      this.isValid = false;
      return '';
    }

    return removeRepoPathPrefix(filePaths[0]);
  }

  getConfigContent() {
    return this._getYamlConfigContent();
  }

  /**
   * Get the variables for the **Quickstart** mutation.
   *
   * @returns The ID for this install plan
   */
  getMutationVariables() {
    return this.config.id;
  }

  /**
   * Submits a mutation to NerdGraph for a single install plan.
   */
  public async submitMutation(dryRun = true) {
    const { data, errors } = await fetchNRGraphqlResults<
      InstallPlanMutationVariable,
      InstallPlanMutationResponse
    >({
      queryString: INSTALL_PLAN_MUTATION,
      variables: this._getComponentMutationVariables(dryRun),
    });

    return { name: this.config.name, data, errors };
  }

  /**
   * Get the **component-specific** mutation variables.
   *
   * @todo: add this to the abstract class (or create an interface)
   */
  private _getComponentMutationVariables(
    dryRun: boolean
  ): InstallPlanMutationVariable {
    const { id, description, name, title, install, fallback } = this.config;

    return {
      dryRun,
      id,
      description,
      displayName: name,
      heading: title,
      primary: this._parseInstallDirective(install),
      fallback: this._parseInstallDirective(fallback),
      target: this._buildInstallPlanTargetVariable(),
    };
  }

  /**
   * Helper method that returns the directive, regardless of type.
   */
  private _parseInstallDirective(
    directive: InstallPlanInstall
  ): InstallPlanDirectiveInput {
    const { mode, destination } = directive;

    switch (mode) {
      case 'targetedInstall':
        return {
          targeted: { recipeName: destination && destination.recipeName },
        };

      case 'link':
        return { link: { url: destination && destination.url } };

      case 'nerdlet':
        return {
          nerdlet: {
            nerdletId: destination && destination.nerdletId,
            nerdletState:
              destination && JSON.stringify(destination.nerdletState),
          },
        };

      // Defaults to submitting an invalid directive, so that validation can catch it
      default:
        return { mode, destination: undefined };
    }
  }

  /**
   * Builds the target parameter from the config into the variables for NR Request.
   */
  private _buildInstallPlanTargetVariable(): InstallPlanTargetInput {
    const { target } = this.config;

    const type = target.type.toUpperCase();
    const destination = target.destination.toUpperCase();

    const upperCaseTarget = { type, destination } as InstallPlanTargetInput;

    if ('os' in target && Array.isArray(target.os)) {
      upperCaseTarget.os = target.os.map(
        (str) => str.toUpperCase() as Uppercase<InstallPlanConfigTargetOS>
      );
    }

    return upperCaseTarget;
  }
}

export default InstallPlan;